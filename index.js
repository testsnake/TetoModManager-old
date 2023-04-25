// Built-in modules
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Electron modules
const { app, BrowserWindow, ipcMain, shell } = require('electron');

// External packages
const Store = require('electron-store');
const { parse, stringify } = require('@iarna/toml');
const { parse: parseDate, isValid } = require('date-fns');
const { extractFull } = require('node-7z');
const sevenBin = require('7zip-bin');
const disk = require('diskusage');
const { readKey } = require('registry-js');
const axios = require('axios');

// Initialize instances
const userData = new Store({ name: 'TMM-config' });


// Global variables
let gameVersion;
let win;
let devMode;
let downloadList = new Map();


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

//
ipcMain.handle('get-mods', async () => {
    const gamePath = await getGamePath();
    consoleM(`Scanning ${gamePath} for mods...`);
    await findValidMods(gamePath);
    consoleM('Done scanning for mods');
    return userData.get('game.mods');
});

ipcMain.handle('set-mod-status', async (event, modName, shouldBeEnabled) => {
    const mods = userData.get('game.mods');
    const mod = mods[modName];
    if (mod) {
        setModStatus(mod.path, shouldBeEnabled);
        // Update the enabled status in the current profile
        currentProfile.enabledMods[modName] = shouldBeEnabled;
        userData.set('profiles', profiles);

        userData.set('game.mods', mods);
        consoleM(`Mod ${modName} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
    } else {
        console.error(`Mod ${modName} not found`);
    }
});

ipcMain.handle('open-dev-console', (event) => {

    if (!devMode) {
        devMode = true;
        consoleM('Opening dev console...')
        win.webContents.openDevTools();
    }
});

ipcMain.on('launch-game', (event) => {
    shell.openExternal(`steam://rungameid/1761390`);
});

ipcMain.on('open-mod-folder', async (event) => {
    consoleM('Opening mod folder...')
    const gamePath = await getGamePath();
    const modPath = path.join(gamePath, 'mods');
    spawn('explorer', [modPath]);
});

ipcMain.handle('create-profile', async (event, profileName) => {
    if (!profiles[profileName]) {
        profiles[profileName] = { ...defaultProfile, name: profileName };
        userData.set('profiles', profiles);
        currentProfile = profiles[profileName];
        await updateProfileWithCurrentModStatus();
    } else {
        console.error(`Profile ${profileName} already exists`);
    }
});

ipcMain.handle('rename-profile', (event, oldProfileName, newProfileName) => {
    try {
        if (newProfileName === undefined || newProfileName === '' || newProfileName === null) {
            if (win) {
                win.webContents.send('alert-user', `Profile Name Error Code: 0021`);

            }
            return;
        } else if (oldProfileName === undefined || oldProfileName === '' || oldProfileName === null) {
            if (win) {
                win.webContents.send('alert-user', `Profile Name Error Code: 0022`);
            }
            return;
        }
        if (profiles[oldProfileName] && !profiles[newProfileName]) {
            profiles[newProfileName] = {...profiles[oldProfileName], name: newProfileName};
            delete profiles[oldProfileName];
            userData.set('profiles', profiles);
            const currentProfileName = userData.get('currentProfile');
            if (currentProfileName === oldProfileName) {
                userData.set('currentProfile', newProfileName);
            }
        } else {
            console.error(`Error renaming profile: ${oldProfileName} to ${newProfileName}`);
            if (win) {
                win.webContents.send('alert-user', `Error renaming profile: ${oldProfileName} to ${newProfileName} Error Code: 0023`);
            }
        }
    } catch (err) {
        console.error(`Error renaming profile: ${oldProfileName} to ${newProfileName}`, err);
        if (win) {
            win.webContents.send('alert-user', `Error renaming profile: ${oldProfileName} to ${newProfileName}`);
        }
    }
});

ipcMain.handle('delete-profile', (event, profileName) => {
    profiles = userData.get('profiles');
    if (profiles) {
        const keyCount = Object.keys(profiles).length;
        if (profiles[profileName] && profileName !== 'Default' && keyCount > 1) {
            delete profiles[profileName];
            userData.set('profiles', profiles);
            if (currentProfileName === profileName) {
                currentProfileName = 'Default';
                userData.set('currentProfile', currentProfileName);
            }
        } else {
            console.error(`Cannot delete profile: ${profileName}`);
            if (win) {
                win.webContents.send('alert-user', `Cannot delete profile: ${profileName}`);
            }


        }
    } else {
        console.error(`Cannot delete profile: ${profileName}`);
        if (win) {
            win.webContents.send('alert-user', `Cannot delete profile: ${profileName}`);
        }
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
    consoleM(`Attempting to increase priority of mod ${modName}`);
    const modOrder = currentProfile.modOrder;
    consoleM('Current mod order:', modOrder);

    // if modname is an int, then use that as the index

    let modIndex = (typeof modName === 'number' && modName >= 0 && modName < modOrder.length) ? modName : modOrder.indexOf(modName);

    if (modIndex === -1) {
        modIndex = parseInt(modName) - 1;
    }

    consoleM('Mod index:', modIndex);


    if (modIndex > 0) {
        // Swap mod positions in the modOrder array
        [modOrder[modIndex], modOrder[modIndex - 1]] = [modOrder[modIndex - 1], modOrder[modIndex]];
        profiles[currentProfileName].modOrder = modOrder; // Update the modOrder in the profiles object
        userData.set('profiles', profiles);
        consoleM(`Mod ${modName} has been moved up in priority`);
        consoleM('Updated mod order:', modOrder);
    } else {
        console.error(`Cannot increase priority of mod ${modName}`);
    }
});

ipcMain.handle('decrease-mod-priority', (event, modName) => {
    consoleM(`Attempting to decrease priority of mod ${modName}`);
    const modOrder = currentProfile.modOrder;
    consoleM('Current mod order:', modOrder);

    let modIndex = (typeof modName === 'number' && modName >= 0 && modName < modOrder.length) ? modName : modOrder.indexOf(modName);

    if (modIndex === -1) {
        modIndex = parseInt(modName) - 1;
    }

    consoleM('Mod index:', modIndex);

    if (modIndex >= 0 && modIndex < modOrder.length - 1) {
        // Swap mod positions in the modOrder array
        [modOrder[modIndex], modOrder[modIndex + 1]] = [modOrder[modIndex + 1], modOrder[modIndex]];
        profiles[currentProfileName].modOrder = modOrder; // Update the modOrder in the profiles object
        userData.set('profiles', profiles);
        consoleM(`Mod ${modName} has been moved down in priority`);
        consoleM('Updated mod order:', modOrder);
    } else {
        console.error(`Cannot decrease priority of mod ${modName}`);
    }
});


ipcMain.handle('get-profiles', () => {
    return profiles;
});

ipcMain.handle('get-active-profile', () => {
    if (currentProfile) {
        return currentProfile;
    } else {
        if (win) {
            win.webContents.send('alert-user', 'No active profile found Error Code: 0020');
        }
        console.error('No active profile found Error Code: 0020');
        return profiles[0];
    }
});

ipcMain.handle('config-get-dml-config-value', async () => {
    consoleM('Getting config.toml data');
    return await getConfigTomlData();
});

ipcMain.handle('config-set-dml-config-value', async (event, key, value) => {
    consoleM(`Setting config.toml value ${key} to ${value}`);
    await setConfigTomlData(key, value);
});

ipcMain.handle('get-dml-latest-version', async () => {
    return await fetchLatestDMLRelease();
});


ipcMain.handle('get-mods-value', async () => {
    const gamePath = await getGamePath();
    return readGameConfigValue(gamePath, 'mods');
});

ipcMain.handle('get-mod-value', async (event, modName) => {
    return userData.get(`game.mods.${modName}`);

});

ipcMain.handle('set-mods-value', async (event, newValue) => {
    const gamePath = await getGamePath();
    await setGameConfigValue(gamePath, 'mods', newValue);
});

ipcMain.handle('update-mod-priorities', async () => {

    const gamePath = await getGamePath();
    consoleM(`Updating mod priorities in ${gamePath}`);
    const configPath = path.join(gamePath, 'config.toml');
    consoleM(`Updating mod priorities in ${configPath}`);
    const modOrder = currentProfile.modOrder;

    if (fs.existsSync(configPath)) {
        const config = parse(fs.readFileSync(configPath, 'utf-8'));
        config.priority = modOrder;
        fs.writeFileSync(configPath, stringify(config));
        consoleM('Mod priorities have been updated in the global config.toml file.');
    } else {
        consoleM('Could not find the global config.toml file.');
    }
});

//TODO replace with gamebanana integration
ipcMain.handle('open-gamebanana', () => {
    shell.openExternal('https://gamebanana.com/games/16522');
});

ipcMain.handle('get-game-metadata', async () => {
    let gameVersionValue;
    try {
        if (gameVersion === undefined) {
            gameVersion = await getGameVersion();
        }
        gameVersionValue = gameVersion;
    } catch (error) {
        gameVersionValue = "unknown";
    }

    let gamePathValue;
    try {
        gamePathValue = await getGamePath();
    } catch (error) {
        gamePathValue = "unknown";
    }

    const modCountValue = Object.keys(userData.get('game.mods')).length;

    let modloaderVersionValue;
    try {
        modloaderVersionValue = await getModLoaderVersion();
    } catch (error) {
        modloaderVersionValue = "not installed";
    }

    let modloaderDataValue;
    try {
        const dmlPath = path.join(gamePathValue, 'config.toml');
        modloaderDataValue = parse(fs.readFileSync(dmlPath, 'utf-8'));
    } catch (error) {
        modloaderDataValue = "unknown";
    }

    const tmmVersion = app.getVersion();

    return {
        "gameVersion": gameVersionValue,
        "gamePath": gamePathValue,
        "modCount": modCountValue,
        "dmlVersion": modloaderVersionValue,
        "tmmVersion": tmmVersion,
        "modloaderData": modloaderDataValue
    }
});


ipcMain.handle('download-file', async (event, url, path) => {
    return await downloadFile(url, path);
});

ipcMain.handle('download-file-to-diva', async (event, url, pathDownload) => {
    let gamePath
    if (pathDownload.length > 0) {
        gamePath = path.join(await getGamePath(), pathDownload);
    } else {
        gamePath = await getGamePath();
    }
    return await downloadAndUnzip(url, `${gamePath}`);
});

ipcMain.handle('install-local-file-to-diva', async (event, pathDownload) => {
    let gamePath = path.join(await getGamePath(), 'mods');
    return await unzipFile(pathDownload, `${gamePath}`);
});


const createWindow = () => {


    win = new BrowserWindow({
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



    if (devMode) {
        win.webContents.openDevTools();
    }

    win.loadFile('src/index.html');

    startup();
}

function startup() {
    getGamePath()
        .then((gamePath) => {
            consoleM('Game path:', gamePath);
            return findValidMods(gamePath, userData.get('firstRun'));
        })
        .then(() => {
            if (userData.get('firstRun') === undefined || userData.get('game.path') === null) {
                userData.set('firstRun', true);
                consoleM("This is the first time you have run this app");
                return updateProfileWithCurrentModStatus();
            } else {
                consoleM("This is not the first time you have run this app");
            }
        })
        .catch((error) => {
            console.error('Error while getting the game path:', error);
        });
}


async function getGamePathFromUser() {
    return new Promise((resolve) => {
        if (win) {
            win.webContents.send('get-path-from-user');
            ipcMain.once('returned-path-from-user', (event, result) => {
                resolve(result);
            });
        } else {
            resolve(null);
        }
    });

}

async function getSteamFolder() {
    let steamFolder = '';

    switch (process.platform) {
        case 'win32':
            try {
                const registryResult = readKey(HKEY.HKEY_LOCAL_MACHINE, 'SOFTWARE\\WOW6432Node\\Valve\\Steam');
                const installPath = registryResult.values.find((value) => value.name === 'InstallPath');

                if (installPath) {
                    steamFolder = installPath.data;
                } else {
                    steamFolder = 'C:\\Program Files (x86)\\Steam';
                }
            } catch (err) {
                console.error('Error reading registry:', err);
                steamFolder = 'C:\\Program Files (x86)\\Steam';
            }
            break;
        case 'darwin':
            steamFolder = path.join(process.env.HOME, 'Library/Application Support/Steam');
            break;
        case 'linux':
            const configFile = path.join(process.env.HOME, '.steam/steam/config/config.vdf');
            if (fs.existsSync(configFile)) {
                const configData = fs.readFileSync(configFile, 'utf-8');
                const basePathMatch = configData.match(/"BaseInstallFolder_1"\s+"(.+?)"/);
                if (basePathMatch && basePathMatch[1]) {
                    steamFolder = basePathMatch[1];
                } else {
                    steamFolder = path.join(process.env.HOME, '.local/share/Steam');
                }
            } else {
                steamFolder = path.join(process.env.HOME, '.local/share/Steam');
            }
            break;
        default:
            console.error(`Unsupported platform: ${process.platform}`);
            break;
    }

    return steamFolder;
}

async function getGamePath() {
    try {
        let pathGame = userData.get('steamGame.1761390.installDir');
        let pathGame2 = path.join(pathGame, 'DivaMegaMix.exe');

        const isValid = await fs.promises.access(pathGame2)
            .then(() => true)
            .catch(() => false);


        if (isValid) {
            consoleM(`Game path ${pathGame} is valid`)
            return pathGame;
        } else {
            consoleM(`Game path ${pathGame} is invalid`);
        }

        const appId = 1761390;
        consoleM(`App ID: ${appId}`);
        // Set Steam installation paths for different platforms
        let steamFolder = await getSteamFolder();

        consoleM(`Steam folder for ${process.platform}: ${steamFolder}`);

        consoleM(`Steam folder: ${steamFolder}`);

        const storedPath = userData.get(`steamGame.${appId}.installDir`);

        consoleM(`Stored path: ${storedPath}`);

        if (storedPath) {
            if (fs.existsSync(storedPath)) {
                consoleM('Using stored game path:', storedPath)
                return storedPath;
            } else {
                // Remove the inaccurate path from the store
                consoleM('Removing inaccurate game path:', storedPath)
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

                    if (installDirMatch && installDirMatch[1] && fs.existsSync(path.join(steamAppsFolder, 'common', installDirMatch[1], 'DivaMegaMix.exe'))) {
                        const installDir = path.join(steamAppsFolder, 'common', installDirMatch[1]);
                        userData.set(`steamGame.${appId}.installDir`, installDir);
                        return installDir;
                    }
                }
            }

        } catch (error) {
            console.error('Error while searching for the game path:', error);
            consoleM(`Could not find the game path in ${steamAppsFolder}.`)
        }
        if (win) {
            win.webContents.send('alert-user', `Could not find the game path in ${steamAppsFolder}.`);
        }
        const userPath = path.join(await getGamePathFromUser(), 'DivaMegaMix.exe')

        if (fs.existsSync(userPath)) {
            consoleM('Using user game path:', userPath);
            userData.set(`steamGame.${appId}.installDir`, userPath);
            return userPath;
        } else {
            consoleM('User game path is invalid:', userPath);
            if (win) {
                win.webContents.send('alert-user', `The game path [${userPath} you entered is invalid. Please restart TMM and try again.`);
            }
        }
        // If the function didn't return earlier, call getGamePathFromUser()
    } catch (error) {
        consoleM(`Error while getting the game path: ${error}`);
    }
}

async function findValidMods(gamePath) {
    const modsFolderPath = path.join(gamePath, 'mods');

    if (!fs.existsSync(modsFolderPath)) {
        consoleM('Mods folder not found');
        return;
    }

    const folders = fs.readdirSync(modsFolderPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    let currentMods = userData.get('game.mods') || {};

    // Remove mods that don't exist anymore
    for (const modName in currentMods) {
        if (!folders.includes(modName)) {
            consoleM(`Removing mod: ${modName}`);
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

        // For compatibility with (NML) mods
        const metaJsonPath = path.join(modFolderPath, 'meta.json');
        let metaData = {};
        let isNMLmod = false;
        let isUpdatable = false;
        if (fs.existsSync(metaJsonPath)) {
            try {
                metaData = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'));
                isNMLmod = true;
            } catch (error) {
                console.error(`Error parsing meta.json for mod ${folder}:`, error.message);
            }
        }

        // For compatibility with DivaModManager installs
        const modJsonPath = path.join(modFolderPath, 'mod.json');
        if (fs.existsSync(modJsonPath)) {
            try {
                const modJson = JSON.parse(fs.readFileSync(modJsonPath, 'utf-8'));
                if (!metaData.source) {
                    metaData.source = modJson.homepage;
                }
                if (!metaData.banner) {
                    metaData.banner = modJson.preview;
                }
                if (!metaData.description) {
                    metaData.description = modJson.description;
                }

            } catch (error) {
                console.error(`Error parsing mod.json for mod ${folder}:`, error.message);
            }
        }

        if (!fs.existsSync(configPath)) {
            continue;
        }

        const lines = readConfig(configPath);

        const enabledLine = lines.find(line => line.startsWith('enabled ='));
        const enabled = enabledLine && enabledLine.includes('true');

        const nameLine = lines.find(line => line.startsWith('name ='));
        let internalName;
        if (nameLine) {
            internalName = nameLine.split('=')[1].trim();
        }

        const dateLine = lines.find(line => line.startsWith('date ='));
        const versionLine = lines.find(line => line.startsWith('version ='));
        const descriptionLine = lines.find(line => line.startsWith('description ='));
        const authorLine = lines.find(line => line.startsWith('author ='));

        const dateFormats = ['dd.MM.yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
        let parsedDate = null;
        if (dateLine) {
            for (const format of dateFormats) {
                const tempDate = parseDate(dateLine.split('=')[1].trim(), format, new Date());
                if (isValid(tempDate)) {
                    parsedDate = tempDate;
                    break;
                }
            }
        }
        const date = metaData.date ?? (parsedDate ? parsedDate.toISOString() : '');

        const version = metaData.version ? metaData.version.join('.') : (versionLine ? versionLine.split('=')[1].trim() : '');
        const description = metaData.description ?? (descriptionLine ? descriptionLine.split('=')[1].trim() : '');
        const author = metaData.authors ? metaData.authors.join(', ') : (authorLine ? authorLine.split('=')[1].trim() : '');

        let firstDetected = new Date().toISOString();

        if (currentMods[folder]) {
            // Use the existing timestamp if available, otherwise use the current timestamp
            firstDetected = currentMods[folder].firstDetected || firstDetected;
        } else {
            consoleM(`First time detecting mod: ${folder}`);
        }

        const profileEnabledStatus = currentProfile.enabledMods.hasOwnProperty(folder) ? currentProfile.enabledMods[folder] : enabled;
        consoleM(`Mod: ${folder}, enabled: ${enabled}, profile enabled: ${profileEnabledStatus}, 
        previous enabled: ${currentMods[folder] && currentMods[folder].enabled}`);

        const priority = currentProfile.modOrder.indexOf(folder) + 1;

        consoleM(`Adding mod: ${folder}, path: ${modFolderPath}, first detected: ${firstDetected}, 
        enabled: ${profileEnabledStatus}, date: ${date}, version: ${version}, description: ${description},
        author: ${author}, priority: ${priority}`);

        if (metaData.source || metaData.updates) {
            isUpdatable = true;
        }

        currentMods[folder] = {
            path: modFolderPath,
            firstDetected,
            enabled: profileEnabledStatus,
            date,
            version,
            description,
            author,
            priority: priority,
            name: metaData.name ?? internalName ?? folder,
            descriptionLong: metaData.descriptionLong,
            firstRelease: metaData.firstRelease,
            lastUpdate: metaData.lastUpdate,
            tags: metaData.tags,
            supportedVersions: metaData.supportedVersions,
            loadBefore: metaData.loadBefore,
            loadAfter: metaData.loadAfter,
            updates: metaData.updates,
            banner: metaData.banner,
            source: metaData.source,
            settingsFile: metaData.settingsFile,
            dependencies: metaData.dependencies,
            isnmlmod: isNMLmod,
            isupdatable: isUpdatable,
        };


    }

    // Sort existing mods by priority
    existingMods.sort((a, b) => currentMods[a].priority - currentMods[b].priority);

    // Reorder mods according to their priority
    currentProfile.modOrder = [...existingMods, ...newMods]
        .filter((mod, index, array) => array.indexOf(mod) === index);

    profiles[currentProfileName].modOrder = currentProfile.modOrder;

    userData.set('game.mods', currentMods);
    userData.set('profiles', profiles);

    consoleM('Finished detecting mods');
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
        consoleM(`Could not find the enabled line in ${configPath}`);
        return;
    }

    lines[enabledLineIndex] = `enabled = ${shouldBeEnabled}`;

    writeConfig(configPath, lines);
    consoleM(`Mod at ${modPath} has been ${shouldBeEnabled ? 'enabled' : 'disabled'}`);
}

function isModEnabled(modPath) {
    const configPath = path.join(modPath, 'config.toml');
    const lines = readConfig(configPath);

    const enabledLineIndex = lines.findIndex(line => line.startsWith('enabled ='));
    if (enabledLineIndex === -1) {
        consoleM(`Could not find the enabled line in ${configPath}`);
        return false;
    }

    return lines[enabledLineIndex].split('=')[1].trim() === 'true';
}

async function updateProfileWithCurrentModStatus() {
    const gamePath = await getGamePath();
    const mods = userData.get('game.mods');

    for (const modName in mods) {
        const mod = mods[modName];
        currentProfile.enabledMods[modName] = isModEnabled(mod.path);
    }

    userData.set('profiles', profiles);
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
        consoleM(`Value of ${key} in ${configPath} has been set to ${newValue}`);
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


async function getGameVersion() {
    const gameDirPath = await getGamePath();
    const gamePath = path.join(gameDirPath.toString(), "DivaMegaMix.exe");
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(gamePath);
        stream.on("error", (err) => {
            reject(err);
        });
        stream.on("data", (data) => {
            hash.update(data);
        });
        stream.on("end", () => {
            const hashValue = hash.digest("hex");
            switch (hashValue) {
                case "940dec9a8924837748cd80e00fb6ec85":
                    resolve("1.00");
                    break;
                case "166f9da061b346735c7199a978511e5e":
                    resolve("1.01");
                    break;
                case "26d808a17cbe83717d6a09ca18a5bd4b":
                    resolve("1.02");
                    break;
                case "813e1befae1776d4fafdf907e509b28b":
                    resolve("1.03");
                    break;
                default:
                    reject("Unknown version");
                    break;
            }
        });
    });
}

async function getModLoaderVersion() {
    const gameDirPath = await getGamePath();
    const modLoaderPath = path.join(gameDirPath, "config.toml");
    const configData = await fs.promises.readFile(modLoaderPath, "utf-8");
    const config = parse(configData);
    return config.version;
}

function consoleM(message) {
    if (devMode) {
        console.log(message);
        if (win) {
            win.webContents.send('debug-message', `${message}`);
        }
    }
}

async function getConfigTomlData() {
    const gameDirPath = await getGamePath();
    const modLoaderPath = path.join(gameDirPath, "config.toml");
    try {
        const configData = await fs.promises.readFile(modLoaderPath, "utf-8");
        return parse(configData);
    } catch (e) {
        return {};getConfigTomlData
    }
}

async function setConfigTomlData(key, value) {
    const currentConfigData = await getConfigTomlData();
    currentConfigData[key] = value;
    const gameDirPath = await getGamePath();
    const modLoaderPath = path.join(gameDirPath, "config.toml");
    const updatedConfigData = stringify(currentConfigData);
    await fs.promises.writeFile(modLoaderPath, updatedConfigData);
}

async function fetchLatestDMLRelease() {
    const url = 'https://api.github.com/repos/blueskythlikesclouds/DivaModLoader/releases/latest';

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        return null;
    }
}

async function downloadAndUnzip(url, destination, shouldDeleteSourceFile = true) {
    try {
        consoleM(`Downloading ${url} to ${destination}`);
        const fileName = path.basename(url);
        const tempFilePath = path.join(destination, fileName);

        // Download the file and track progress
        const response = await axios.get(url, {
            responseType: 'stream',
            onDownloadProgress: (progress) => {
                const percentage = Math.round((progress.loaded / progress.total) * 100);
                sendPercentage(percentage);
                downloadList.set(url, percentage);
            },
        });

        // Automatically add the download to the list with initial progress 0
        if (!downloadList.has(url)) {
            downloadList.set(url, 0);
        }

        // Handle connection issues and other errors
        if (response.status !== 200) {
            throw new Error(`Failed to download file. Status code: ${response.status}`);
        }

        // Save the downloaded file to disk
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        consoleM(`Downloaded ${url} to ${tempFilePath}`);

        let unzipResult = { complete: false, path: url, error: 'Could not unzip file' };
        consoleM(`Waiting for file to exist: ${tempFilePath}...`)
        await sleep(100);
        consoleM(`Done waiting for file to exist: ${tempFilePath}...`)
        try {
            // Wait for the file to exist for up to 5 seconds
            await Promise.race([
                fs.promises.access(tempFilePath, fs.constants.R_OK),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('File not found after 5 seconds')), 5000)
                ),
            ]);

            // Unzip the downloaded file
            try {
                unzipResult = await unzipFile(tempFilePath, destination, shouldDeleteSourceFile);
            } catch (error) {
                sendAlert(`Could not unzip file: ${tempFilePath} Error 0043`);
            }
        } catch (error) {
            consoleM(`Could not read file: ${tempFilePath}`);
            sendAlert(`Could not read file: ${tempFilePath} Error 0040`);
        }

        // Remove the downloaded file from the list
        downloadList.delete(url);

        return unzipResult;
    } catch (error) {
        downloadList.delete(url);
        return { complete: false, path: url, error: error.message };
    }
}


function getDownloadProgress() {
    let progressList = [];
    for (const [url, progress] of downloadList.entries()) {
        progressList.push({ url, progress });
    }
    return progressList;
}

async function unzipFile(file, destination, shouldDeleteSourceFile = false)  {
    try {
        consoleM(`Unzipping ${file} to ${destination}`);

        // Wait for a short period to ensure the file is accessible
        await sleep(1000);

        // Check if the file exists and is a file
        try {
            const fileStat = await fs.promises.stat(file);
            if (!fileStat.isFile()) {
                throw new Error('Not a file');
            }
            consoleM(`File found: ${file}`);
        } catch (error) {
            consoleM(`File not found: ${file}`);
            sendAlert(`File not found: ${file} Error 0041`);
            return { complete: false, path: file, error: 'File not found' };

        }

        // Get the archive information
        const archiveInfo = await extractFull(file, destination, {
            $bin: sevenBin.path7za,
            $progress: true,
            list: true,
        });

        consoleM(`Archive info: ${JSON.stringify(archiveInfo)}`);

        const estimatedSize = archiveInfo.totalSize || 0;

        // Check if there is enough space on the disk
        const diskSpace = await disk.check(path.parse(destination).root);
        if (diskSpace.available < estimatedSize) {
            sendAlert(`Not enough disk space to unzip file: ${file} Error 0044`);
            return { complete: false, path: file, error: 'Not enough disk space' };
        }
        consoleM(`Disk space: ${diskSpace.available} / ${estimatedSize}`)

        // Confirm unzip
        const confirm = await confirmUnZip(estimatedSize);
        consoleM(`User confirmed unzip: ${confirm}`)
        if (!confirm) {
            return { complete: false, path: file, error: 'User did not confirm unzip' };
        }


        let password = '';
        while (true) {
            consoleM(`Unzipping file: ${file} with password: ${password}`)
            try {
                const extractor = extractFull(file, destination, {
                    $bin: sevenBin.path7za,
                    $progress: true,
                    password: password,
                });
                // consoleM(`Extractor: ${JSON.stringify(extractor)}`)


                extractor.on('progress', (progress) => {
                    sendPercentage(Math.round(progress.percent));
                });

                await extractor;

                // Delete the original zip file and return the result
                await sleep(1000);
                sendPercentage(100);
                if (shouldDeleteSourceFile) {
                    consoleM(`Deleting file: ${file}`);
                    // fs.unlinkSync(file);
                }
                return { complete: true, path: destination, filesize: estimatedSize };
            } catch (error) {
                if (error.message.includes('Encrypted file')) {
                    password = await getPassword();
                    if (!password) {
                        return { complete: false, path: file, error: 'No password provided' };
                    }
                } else {
                    await sendAlert(`Could not unzip file: ${file} Error 0042`);
                    await sendAlert(`Error: ${error.message}`);
                    throw error;
                }
            }
        }
    } catch (error) {
        await sendAlert(`Could not unzip file: ${file} Error 0044`);
        await sendAlert(`Error: ${error.message}`);
        return { complete: false, path: file, error: error.message };
    }
}

async function confirmUnZip(estimatedSize) {
    // TODO - Send estimated size to the renderer process
    consoleM(`Estimated size: ${estimatedSize}`);
    return true;
}

async function getPassword() {
    // TODO - Get password from the renderer process
    consoleM('Password: ');
    return '';
}

function sendPercentage(value) {
    // TODO - Send percentage to the renderer process
    consoleM(`Percentage: ${value}`);
}

async function sendAlert(alert) {
    consoleM(`Alert: ${alert}`);
    if (win) {
        win.webContents.send('alert-user', `${alert}`);
    }

}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        // Prevent the default navigation behavior
        event.preventDefault();

        // Open external links in the user's default web browser
        shell.openExternal(navigationUrl);
    });

    contents.on('new-window', (event, navigationUrl) => {
        // Prevent the default new-window behavior
        event.preventDefault();

        // Open external links in the user's default web browser
        shell.openExternal(navigationUrl);
    });
});


app.whenReady().then(() => {
    if (process.env.NODE_ENV === 'development') {
        devMode = true;
    }
    createWindow()
})