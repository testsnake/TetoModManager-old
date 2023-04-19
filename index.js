const { app, BrowserWindow } = require('electron')
const fs = require('fs')

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#2f3241',
            symbolColor: '#FFFFFF',
            height: 20
        },
        backgroundColor: '#191825',
        minWidth: 600,
        minHeight: 400,

    })

    win.loadFile('src/index.html')
}

app.whenReady().then(() => {
    createWindow()
})