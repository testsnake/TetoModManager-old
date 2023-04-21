const { app, BrowserWindow } = require('electron')
const fs = require('fs');
const Store = require('electron-store');
const { ipcMain , shell} = require('electron');
const path = require('path');
const userData = new Store({name: 'NMM-config'});
const { parse, stringify } = require('@iarna/toml');


// Default profile structure
const defaultProfile = {
    name: 'Default',
    enabledMods: {},
    modOrder: []
};

// Initialize profiles
let profiles = userData.get('profiles') || { Default: defaultProfile };
userData.set('profiles', profiles);

// Set the current profile
let currentProfileName = userData.get('currentProfile') || 'Default';
let currentProfile = profiles[currentProfileName];


const { spawn } = require('child_process');






ipcMain.handle('get-mods', async () => {
    const gamePath = await getGamePath();
    await findValidMods(gamePath);
    return userData.get('game.mods');
});

// ipcMain.handle('set-mod-status', async (event, modName, shouldBeEnabled) => {
//     const mods = userData.get('game.mods');
//     const mod = mods[modName];
//
//     if (mod) {
//         setModStatus(mod.path, shouldBeEnabled);
//         mod.enabled = shouldBeEnabled;
//         userData.set('game.mods', mods);
//         console.log(`Mod ${modName} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
//     } else {
//         console.error(`Mod ${modName} not found`);
//     }
// });

ipcMain.handle('set-mod-status', async (event, modName, shouldBeEnabled) => {
    const mods = userData.get('game.mods');
    const mod = mods[modName];
    if (mod) {
        setModStatus(mod.path, shouldBeEnabled);
        // Update the enabled status in the current profile
        currentProfile.enabledMods[modName] = shouldBeEnabled;
        userData.set('profiles', profiles);

        userData.set('game.mods', mods);
        console.log(`Mod ${modName} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
    } else {
        console.error(`Mod ${modName} not found`);
    }
});

ipcMain.on('launch-game', (event) => {
    shell.openExternal(`steam://rungameid/1761390`);
});

ipcMain.on('open-mod-folder', async (event) => {
    console.log('Opening mod folder...')
    const gamePath = await getGamePath();
    const modPath = path.join(gamePath, 'mods');
    spawn('explorer', [modPath]);
});

ipcMain.handle('make-profile', (event, profileName) => {
    if (!profiles[profileName]) {
        profiles[profileName] = { ...defaultProfile, name: profileName };
        userData.set('profiles', profiles);
    } else {
        console.error(`Profile ${profileName} already exists`);
    }
});

ipcMain.handle('rename-profile', (event, oldProfileName, newProfileName) => {
    if (profiles[oldProfileName] && !profiles[newProfileName]) {
        profiles[newProfileName] = { ...profiles[oldProfileName], name: newProfileName };
        delete profiles[oldProfileName];
        userData.set('profiles', profiles);
        if (currentProfileName === oldProfileName) {
            currentProfileName = newProfileName;
            userData.set('currentProfile', currentProfileName);
        }
    } else {
        console.error(`Error renaming profile: ${oldProfileName} to ${newProfileName}`);
    }
});

ipcMain.handle('delete-profile', (event, profileName) => {
    if (profiles[profileName] && profileName !== 'Default') {
        delete profiles[profileName];
        userData.set('profiles', profiles);
        if (currentProfileName === profileName) {
            currentProfileName = 'Default';
            userData.set('currentProfile', currentProfileName);
        }
    } else {
        console.error(`Cannot delete profile: ${profileName}`);
    }
});

ipcMain.handle('set-active-profile', async (event, profileName) => {
    if (profiles[profileName]) {
        currentProfileName = profileName;
        userData.set('currentProfile', currentProfileName);
        currentProfile = profiles[currentProfileName];
        const gamePath = await getGamePath();
        await findValidMods(gamePath);
        await updateModStatusesBasedOnProfile(currentProfile);
    } else {
        console.error(`Profile ${profileName} not found`);
    }
});

ipcMain.handle('set-default-profile', (event, profileName) => {
    if (profiles[profileName]) {
        userData.set('defaultProfile', profileName);
    } else {
        console.error(`Profile ${profileName} not found`);
    }
});

ipcMain.handle('increase-mod-priority', (event, modName) => {
    console.log(`Attempting to increase priority of mod ${modName}`);
    const modOrder = currentProfile.modOrder;
    console.log('Current mod order:', modOrder);

    // if modname is an int, then use that as the index

    let modIndex = (typeof modName === 'number' && modName >= 0 && modName < modOrder.length) ? modName : modOrder.indexOf(modName);

    if (modIndex === -1) {
        modIndex = parseInt(modName) - 1;
    }

    console.log('Mod index:', modIndex);

    if (modIndex > 0) {
        // Swap mod positions in the modOrder array
        [modOrder[modIndex], modOrder[modIndex - 1]] = [modOrder[modIndex - 1], modOrder[modIndex]];
        profiles[currentProfileName].modOrder = modOrder; // Update the modOrder in the profiles object
        userData.set('profiles', profiles);
        console.log(`Mod ${modName} has been moved up in priority`);
        console.log('Updated mod order:', modOrder);
    } else {
        console.error(`Cannot increase priority of mod ${modName}`);
    }
});

ipcMain.handle('decrease-mod-priority', (event, modName) => {
    console.log(`Attempting to decrease priority of mod ${modName}`);
    const modOrder = currentProfile.modOrder;
    console.log('Current mod order:', modOrder);

    let modIndex = (typeof modName === 'number' && modName >= 0 && modName < modOrder.length) ? modName : modOrder.indexOf(modName);

    if (modIndex === -1) {
        modIndex = parseInt(modName) - 1;
    }

    console.log('Mod index:', modIndex);

    if (modIndex >= 0 && modIndex < modOrder.length - 1) {
        // Swap mod positions in the modOrder array
        [modOrder[modIndex], modOrder[modIndex + 1]] = [modOrder[modIndex + 1], modOrder[modIndex]];
        profiles[currentProfileName].modOrder = modOrder; // Update the modOrder in the profiles object
        userData.set('profiles', profiles);
        console.log(`Mod ${modName} has been moved down in priority`);
        console.log('Updated mod order:', modOrder);
    } else {
        console.error(`Cannot decrease priority of mod ${modName}`);
    }
});


ipcMain.handle('get-profiles', () => {
    return profiles;
});

ipcMain.handle('get-active-profile', () => {
    return currentProfileName;
});

ipcMain.handle('get-console-value', async () => {
    const gamePath = await getGamePath();
    return readGameConfigValue(gamePath, 'console');
});

ipcMain.handle('set-console-value', async (event, newValue) => {
    const gamePath = await getGamePath();
    setGameConfigValue(gamePath, 'console', newValue);
});

ipcMain.handle('get-mods-value', async () => {
    const gamePath = await getGamePath();
    return readGameConfigValue(gamePath, 'mods');
});

ipcMain.handle('set-mods-value', async (event, newValue) => {
    const gamePath = await getGamePath();
    setGameConfigValue(gamePath, 'mods', newValue);
});

ipcMain.handle('update-mod-priorities', async () => {

    const gamePath = await getGamePath();
    console.log(`Updating mod priorities in ${gamePath}`);
    const configPath = path.join(gamePath, 'config.toml');
    console.log(`Updating mod priorities in ${configPath}`);
    const modOrder = currentProfile.modOrder;

    if (fs.existsSync(configPath)) {
        const config = parse(fs.readFileSync(configPath, 'utf-8'));
        config.priority = modOrder;
        fs.writeFileSync(configPath, stringify(config));
        console.log('Mod priorities have been updated in the global config.toml file.');
    } else {
        console.log('Could not find the global config.toml file.');
    }
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
        minWidth: 900,
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
            return findValidMods(gamePath, userData.get('firstRun'));
        })
        .then(() => {
            console.log("Hello! You are on windows!");
            if (userData.get('firstRun') === undefined || userData.get('game.path') === null) {
                userData.set('firstRun', true);
                console.log("This is the first time you have run this app");
            } else {
                console.log("This is not the first time you have run this app");
            }
        })
        .catch((error) => {
            console.error('Error while getting the game path:', error);
        });
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
            const modOrderIndex = currentProfile.modOrder.indexOf(modName);
            if (modOrderIndex !== -1) {
                currentProfile.modOrder.splice(modOrderIndex, 1); // Remove the mod from the modOrder array
            }
        }
    }

    const newMods = folders.filter(folder => !currentMods[folder]);
    const existingMods = folders.filter(folder => currentMods[folder]);

    // Get the max priority of existing mods
    let maxPriority = 0;
    for (const modName in currentMods) {
        maxPriority = Math.max(maxPriority, currentMods[modName].priority);
    }

    // Add new mods to the end of the mod order
    currentProfile.modOrder.push(...newMods);
    profiles[currentProfileName].modOrder.push(...newMods);

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

        const profileEnabledStatus = currentProfile.enabledMods.hasOwnProperty(folder) ? currentProfile.enabledMods[folder] : enabled;
        console.log(`Mod: ${folder}, enabled: ${enabled}, profile enabled: ${profileEnabledStatus}, previous enabled: ${currentMods[folder] && currentMods[folder].enabled}`);

        const priority = currentProfile.modOrder.indexOf(folder) + 1;

        console.log(`Adding mod: ${folder}, path: ${modFolderPath}, first detected: ${firstDetected}, enabled: ${profileEnabledStatus}, date: ${date}, version: ${version}, description: ${description}, author: ${author}, priority: ${priority}`);

        currentMods[folder] = {
            path: modFolderPath,
            firstDetected,
            enabled: profileEnabledStatus,
            date,
            version,
            description,
            author,
            priority: priority
        };


    }

    // Sort existing mods by priority
    existingMods.sort((a, b) => currentMods[a].priority - currentMods[b].priority);

    // Reorder mods according to their priority
    currentProfile.modOrder = [...existingMods, ...newMods].filter((mod, index, array) => array.indexOf(mod) === index);

    profiles[currentProfileName].modOrder = currentProfile.modOrder;

    userData.set('game.mods', currentMods);
    userData.set('profiles', profiles);

    console.log('Finished detecting mods');
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


async function readGameConfigValue(gamePath, key) {
    const configPath = path.join(gamePath, 'config.toml');
    const lines = readConfig(configPath);
    const line = lines.find(line => line.startsWith(`${key} =`));
    if (line) {
        return line.split('=')[1].trim();
    } else {
        console.error(`Could not find the ${key} line in ${configPath}`);
    }
}

async function setGameConfigValue(gamePath, key, newValue) {
    const configPath = path.join(gamePath, 'config.toml');
    const lines = readConfig(configPath);
    const lineIndex = lines.findIndex(line => line.startsWith(`${key} =`));
    if (lineIndex !== -1) {
        lines[lineIndex] = `${key} = ${newValue}`;
        writeConfig(configPath, lines);
        console.log(`Value of ${key} in ${configPath} has been set to ${newValue}`);
    } else {
        console.error(`Could not find the ${key} line in ${configPath}`);
    }
}

async function updateModStatusesBasedOnProfile(profile) {
    const mods = userData.get('game.mods');
    for (const modName in mods) {
        const shouldBeEnabled = profile.enabledMods[modName] === true;
        await setModStatus(mods[modName].path, shouldBeEnabled);
        mods[modName].enabled = shouldBeEnabled;
    }
    userData.set('game.mods', mods);
}



app.whenReady().then(() => {
    createWindow()
})