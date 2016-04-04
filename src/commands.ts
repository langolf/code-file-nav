'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as codeFileNav from './code_file_nav';
const fs = require('fs-extra');
const drivelist = require('drivelist');

interface Bookmark {
    label: string;
    path: string;
}

interface CmdData {
    cwd: string;
    files: codeFileNav.FileData[];
}

interface Cmd {
    position: string;
    label: string;
    handler: (data: CmdData) => void;
    show?: (data: CmdData) => boolean;
}

const cmds: Cmd[] = [
    {
        position: 'top',
        label: '..',
        handler: up,
    },
    {
        position: 'bottom',
        label: '> New file',
        handler: newFile,
    },
    {
        position: 'bottom',
        label: '> New folder',
        handler: newFolder,
    },
    {
        position: 'bottom',
        label: '> Rename',
        handler: rename,
    },
    {
        position: 'bottom',
        label: '> Copy',
        handler: copy,
    },
    {
        position: 'bottom',
        label: '> Cut',
        handler: cut,
    },
    {
        position: 'bottom',
        label: '> Paste',
        handler: paste,
        show: cmdData => !!~['copy', 'cut'].indexOf(cutCopyCmdMemory),
    },
    {
        position: 'bottom',
        label: '> Delete',
        handler: remove,
    },
    {
        position: 'bottom',
        label: '> Change drive',
        handler: changeDrive,
    },
    {
        position: 'bottom',
        label: '> Bookmarks',
        handler: bookmarks,
    },
];

let cutCopyFileMemory: codeFileNav.FileData;
let cutCopyCmdMemory: string;
let lastCmd: string;

function removeInvalidChars(input: string): string {
    return input ? input.replace(/[/?*:"<>|\\]/g, '') : '';
}

function expandVars(path: string): string {
    return path ? path.replace(/\${home}/gi, os.homedir()) : '';
}

export function getList(position: string, data: CmdData): string[] {
    return cmds
        .filter(cmd => cmd.position === position && (cmd.show ? cmd.show(data) : true))
        .map(cmd => cmd.label);
}

export function handle(cmdLabel: string, data: CmdData): boolean {
    const command: Cmd = cmds.find(cmd => cmd.label === cmdLabel);

    if (command) {
        command.handler(data);

        lastCmd = command.label;
    }

    return !!command;
}

////////////////////////////////////////
// Command handlers are defined below //
////////////////////////////////////////

export function up(data: CmdData): void {
    codeFileNav.showFileList(path.join(data.cwd, '..'));
}

export function newFile(data: CmdData): void {
    vscode.window.showInputBox({
        placeHolder: 'Enter your new file name'
    }).then(fileName => {
        fileName = removeInvalidChars(fileName);

        if (!fileName) {
            codeFileNav.showFileList();

            return;
        }

        const filePath: string = path.join(data.cwd, fileName);

        fs.writeFile(filePath, '', err => {
            if (codeFileNav.checkError(err)) { return; }

            codeFileNav.showFileList();
        });
    });
}

export function newFolder(data: CmdData): void {
    vscode.window.showInputBox({
        placeHolder: 'Enter your new folder name'
    }).then(folderName => {
        folderName = removeInvalidChars(folderName);

        if (!folderName) {
            codeFileNav.showFileList();

            return;
        }

        const folderPath: string = path.join(data.cwd, folderName);

        fs.mkdir(folderPath, err => {
            if (codeFileNav.checkError(err)) { return; }

            codeFileNav.showFileList();
        });
    });
}

export function remove(data: CmdData): void {
    vscode.window.showQuickPick(data.files.map(file => file.label), {
        placeHolder: 'Choose a file or folder to delete'
    }).then(label => {
        const file: codeFileNav.FileData = data.files.find(file => file.label === label);

        if (!file) {
            codeFileNav.showFileList();

            return;
        }

        if (!file.isFile && !file.isDirectory) { return; }

        const type: string = file.isFile ? 'file' : 'folder';

        vscode.window.showQuickPick(['No', 'Yes'], {
            placeHolder: `Are you sure you want to permanently delete the "${file.name}" ${type}?`
        }).then(answer => {
            if (answer === 'Yes') {
                fs.remove(file.path, err => {
                    if (codeFileNav.checkError(err)) { return; }

                    codeFileNav.showFileList();
                });
            } else {
                codeFileNav.showFileList();
            }
        });
    });
}

export function rename(data: CmdData): void {
    vscode.window.showQuickPick(data.files.map(file => file.label), {
        placeHolder: 'Choose a file or folder to rename'
    }).then(label => {
        const file: codeFileNav.FileData = data.files.find(file => file.label === label);

        if (!file) {
            codeFileNav.showFileList();

            return;
        }

        vscode.window.showInputBox({
            placeHolder: 'Enter a new name'
        }).then(newName => {
            newName = removeInvalidChars(newName);

            if (!newName) {
                codeFileNav.showFileList();

                return;
            }

            const newPath: string = path.join(data.cwd, newName);

            fs.rename(file.path, newPath, err => {
                if (codeFileNav.checkError(err)) { return; }

                codeFileNav.showFileList();
            });
        });
    });
}

export function copy(data: CmdData): void {
    vscode.window.showQuickPick(data.files.map(file => file.label), {
        placeHolder: 'Choose a file or folder to copy'
    }).then(label => {
        const file: codeFileNav.FileData = data.files.find(file => file.label === label);

        if (!file) {
            codeFileNav.showFileList();

            return;
        }

        cutCopyFileMemory = file;
        cutCopyCmdMemory = 'copy';

        const command: Cmd = cmds.find(cmd => cmd.label.substr(0, '> Paste'.length) === '> Paste');

        if (command) {
            command.label = `> Paste (copy: ${cutCopyFileMemory.name})`;
        }

        codeFileNav.showFileList();
    });
}

export function cut(data: CmdData): void {
    vscode.window.showQuickPick(data.files.map(file => file.label), {
        placeHolder: 'Choose a file or folder to cut'
    }).then(label => {
        const file: codeFileNav.FileData = data.files.find(file => file.label === label);

        if (!file) {
            codeFileNav.showFileList();

            return;
        }

        cutCopyFileMemory = file;
        cutCopyCmdMemory = 'cut';

        const command: Cmd = cmds.find(cmd => cmd.label.substr(0, '> Paste'.length) === '> Paste');

        if (command) {
            command.label = `> Paste (cut: ${cutCopyFileMemory.name})`;
        }

        codeFileNav.showFileList();
    });
}

export function paste(data: CmdData): void {
    if (!cutCopyFileMemory) {
        codeFileNav.showFileList();

        return;
    }

    const method = cutCopyCmdMemory === 'cut' ? fs.move : fs.copy;
    let newPath: string = path.join(data.cwd, cutCopyFileMemory.name);

    fs.access(newPath, err => {
        if (err) {
            method(cutCopyFileMemory.path, newPath, err => {
                cutCopyCmdMemory = undefined;

                if (codeFileNav.checkError(err)) { return; }

                codeFileNav.showFileList();
            });
        } else {
            const type: string = cutCopyFileMemory.isFile ? 'file' : 'folder';

            vscode.window.showInputBox({
                placeHolder: `The destination ${type} already exists, enter a new ${type} name`
            }).then(newName => {
                newName = removeInvalidChars(newName);

                if (!newName) {
                    codeFileNav.showFileList();

                    return;
                }

                newPath = path.join(data.cwd, newName);

                method(cutCopyFileMemory.path, newPath, err => {
                    cutCopyCmdMemory = undefined;

                    if (codeFileNav.checkError(err)) { return; }

                    codeFileNav.showFileList();
                });
            });
        }
    });
}

export function changeDrive(data: CmdData): void {
    drivelist.list((err, drives) => {
        if (codeFileNav.checkError(err)) { return; }

        const driveList: string[] = drives.map(drive => drive.name);

        vscode.window.showQuickPick(driveList).then(drive => {
            codeFileNav.showFileList(drive);
        });
    });
}

export function bookmarks(data: CmdData): void {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('codeFileNav');
    const platform = os.platform();
    const bookmarks: Bookmark[] = config.get(`bookmarks.${platform}`, []);
    const bookmarkQuickPicks: string[] = bookmarks
        .map(bookmark => {
            bookmark.path = expandVars(bookmark.path);

            return bookmark;
        })
        .filter(bookmark => {
            try {
                fs.accessSync(bookmark.path);

                return true;
            }
            catch (err) {
                return false;
            }
        })
        .map(bookmark => bookmark.label);

    vscode.window.showQuickPick(bookmarkQuickPicks).then(bookmarkLabel => {
        const bookmark = bookmarks.find(bookmark => bookmark.label === bookmarkLabel);

        if (!bookmark) {
            codeFileNav.showFileList();

            return;
        }

        bookmark.path = expandVars(bookmark.path);

        codeFileNav.showFileList(bookmark.path);
    });
}
