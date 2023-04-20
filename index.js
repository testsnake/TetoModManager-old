const { app, BrowserWindow } = require('electron')
const fs = require('fs');
const Store = require('electron-store');
const { ipcMain } = require('electron');
const path = require('path');
const userData = new Store({name: 'NMM-config'});

const { spawn } = require('child_process');






ipcMain.handle('get-mods', async () => {
    const gamePath = await getGamePath();
    await findValidMods(gamePath);
    return userData.get('game.mods');
});

ipcMain.handle('set-mod-status', async (event, modName, shouldBeEnabled) => {
    const mods = userData.get('game.mods');
    const mod = mods[modName];

    if (mod) {
        setModStatus(mod.path, shouldBeEnabled);
        mod.enabled = shouldBeEnabled;
        userData.set('game.mods', mods);
        console.log(`Mod ${modName} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
    } else {
        console.error(`Mod ${modName} not found`);
    }
});

ipcMain.on('launch-game', async (event) => {
    const gamePath = await getGamePath();
    const executablePath = path.join(gamePath, 'DivaMegaMix.exe');
    spawn(executablePath);
});

ipcMain.on('open-mod-folder', async (event) => {
    console.log('Opening mod folder...')
    const gamePath = await getGamePath();
    const modPath = path.join(gamePath, 'mods');
    spawn('explorer', [modPath]);
});

const createWindow = () => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#2f3241',
            symbolColor: '#FFFFFF',
            height: 20
        },
        backgroundColor: '#191825',
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,

        },

    })


    win.loadFile('src/index.html');
    win.webContents.openDevTools();
    startup();
}

function startup() {
    getGamePath()
        .then((gamePath) => {
            console.log('Game path:', gamePath);
            findValidMods(gamePath);
        })
        .catch((error) => {
            console.error('Error while getting the game path:', error);
        });
    console.log("Hello! You are on windows!");
    if (userData.get('firstRun') === undefined || userData.get('game.path') === null) {
        userData.set('firstRun', true);
        console.log("This is the first time you have run this app");
    } else {
        console.log("This is not the first time you have run this app");
    }
}

async function getGamePathFromUser() {
    // TODO: Implement this function to get the game path from the user, e.g., through a dialog
}

async function getGamePath() {
    const appId = 1761390;

    // Set Steam installation paths for different platforms
    const platformSteamFolder = {
        win32: 'C:\\Program Files (x86)\\Steam',
        darwin: path.join(process.env.HOME, 'Library/Application Support/Steam'),
        linux: path.join(process.env.HOME, '.local/share/Steam'),
    };

    const steamFolder = platformSteamFolder[process.platform];

    const storedPath = userData.get(`steamGame.${appId}.installDir`);

    if (storedPath) {
        if (fs.existsSync(storedPath)) {
            console.log('Using stored game path:', storedPath)
            return storedPath;
        } else {
            // Remove the inaccurate path from the store
            console.log('Removing inaccurate game path:', storedPath)
            userData.delete(`steamGame.${appId}.installDir`);
        }
    }

    const steamAppsFolder = path.join(steamFolder, 'steamapps');
    const manifestFile = `appmanifest_${appId}.acf`;

    try {
        const files = fs.readdirSync(steamAppsFolder);

        for (const file of files) {
            if (file === manifestFile) {
                const manifestPath = path.join(steamAppsFolder, file);
                const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                const installDirMatch = manifestContent.match(/"installdir"\s+"(.+?)"/);

                if (installDirMatch && installDirMatch[1]) {
                    const installDir = path.join(steamAppsFolder, 'common', installDirMatch[1]);
                    userData.set(`steamGame.${appId}.installDir`, installDir);
                    return installDir;
                }
            }
        }
    } catch (error) {
        console.error('Error while searching for the game path:', error);
    }

    // If the function didn't return earlier, call getGamePathFromUser()
    return getGamePathFromUser();
}

async function findValidMods(gamePath) {
    const modsFolderPath = path.join(gamePath, 'mods');

    if (!fs.existsSync(modsFolderPath)) {
        console.log('Mods folder not found');
        return;
    }

    const folders = fs.readdirSync(modsFolderPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    let currentMods = userData.get('game.mods') || {};

    // Remove mods that don't exist anymore
    for (const modName in currentMods) {
        if (!folders.includes(modName)) {
            console.log(`Removing mod: ${modName}`);
            delete currentMods[modName];
        }
    }

    for (const folder of folders) {
        const modFolderPath = path.join(modsFolderPath, folder);
        const configPath = path.join(modFolderPath, 'config.toml');

        if (!fs.existsSync(configPath)) {
            continue;
        }

        const lines = readConfig(configPath);

        const enabledLine = lines.find(line => line.startsWith('enabled ='));
        const enabled = enabledLine && enabledLine.includes('true');

        const dateLine = lines.find(line => line.startsWith('date ='));
        const versionLine = lines.find(line => line.startsWith('version ='));
        const descriptionLine = lines.find(line => line.startsWith('description ='));
        const authorLine = lines.find(line => line.startsWith('author ='));

        const date = dateLine ? dateLine.split('=')[1].trim() : '';
        const version = versionLine ? versionLine.split('=')[1].trim() : '';
        const description = descriptionLine ? descriptionLine.split('=')[1].trim() : '';
        const author = authorLine ? authorLine.split('=')[1].trim() : '';

        let firstDetected = new Date().toISOString();

        if (currentMods[folder]) {
            // Use the existing timestamp if available, otherwise use the current timestamp
            firstDetected = currentMods[folder].firstDetected || firstDetected;
        } else {
            console.log(`First time detecting mod: ${folder}`);
        }

        console.log(`Adding mod: ${folder}, path: ${modFolderPath}, first detected: ${firstDetected}, enabled: ${enabled}, date: ${date}, version: ${version}, description: ${description}, author: ${author}`);
        currentMods[folder] = { path: modFolderPath, firstDetected, enabled, date, version, description, author };
    }

    userData.set('game.mods', currentMods);
}


function readConfig(filePath) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    return contents.split('\n');
}

function writeConfig(filePath, lines) {
    const contents = lines.join('\n');
    fs.writeFileSync(filePath, contents, 'utf-8');
}

function setModStatus(modPath, shouldBeEnabled) {
    const configPath = path.join(modPath, 'config.toml');
    const lines = readConfig(configPath);

    const enabledLineIndex = lines.findIndex(line => line.startsWith('enabled ='));
    if (enabledLineIndex === -1) {
        console.log(`Could not find the enabled line in ${configPath}`);
        return;
    }

    lines[enabledLineIndex] = `enabled = ${shouldBeEnabled}`;

    writeConfig(configPath, lines);
    console.log(`Mod at ${modPath} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
}







app.whenReady().then(() => {
    createWindow()
})