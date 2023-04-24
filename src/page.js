const { ipcRenderer } = require('electron');
const fs = require("fs");

let mods;
let tbody;
let activeProfile;
let currentProfiles;
let gamepadHoldTimeout;
let gamepadKeybinds = {
    "dpadUp": 12,
    "dpadDown": 13,
    "dpadLeft": 14,
    "dpadRight": 15,
    "buttonOptions": 9,
    "buttonShare": 8,
    "buttonSquare": 2,
    "buttonTriangle": 3,
    "buttonCancel": 1,
    "buttonConfirm": 0,
    "buttonL1": 4,
    "buttonR1": 5,
    "buttonL2": 6,
    "buttonR2": 7,
    "buttonL3": 10,
    "buttonR3": 11,
}
let currentlyHeldGamepadKeybinds  = {
    "dpadUp": false,
    "dpadDown": false,
    "dpadLeft": false,
    "dpadRight": false,
    "buttonOptions": false,
    "buttonShare": false,
    "buttonSquare": false,
    "buttonTriangle": false,
    "buttonCancel": false,
    "buttonConfirm": false,
    "buttonL1": false,
    "buttonR1": false,
    "buttonL2": false,
    "buttonR2": false,
    "buttonL3": false,
    "buttonR3": false,
}


// Sort table rows
function sortRows(key, asc = true, selectedModName = null) {
    console.log('Sorting by', key, asc);
    const sortedMods = Object.entries(mods).sort((a, b) => {
        const aValue = a[1][key];
        const bValue = b[1][key];

        if (typeof aValue === 'string') {
            return asc ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else if (typeof aValue === 'boolean') {
            return aValue === bValue ? 0 : (asc ? (aValue ? -1 : 1) : (aValue ? 1 : -1));
        } else {
            return asc ? (aValue - bValue) : (bValue - aValue);
        }
    });

    const sortedModsObj = {};
    for (const [modName, mod] of sortedMods) {
        sortedModsObj[modName] = mod;
    }

    populateRows(sortedModsObj, selectedModName);

    populateMetaData();

}

async function populateMetaData() {
    const mDataGameVersion = document.getElementById('game-version');
    const mDataGamePath = document.getElementById('game-path');
    const mDataModCount = document.getElementById('mod-count');
    const mDataDMLVersion = document.getElementById('mod-loader-version');
    const mDataTMMVersion = document.getElementById('tmm-version');
    const gameMetadata = await ipcRenderer.invoke('get-game-metadata');
    mDataGameVersion.innerText = `MM+: ${gameMetadata.gameVersion}`;
    mDataGamePath.innerText = `Path: ${gameMetadata.gamePath}`;
    mDataModCount.innerText = `Mods: ${gameMetadata.modCount}`;
    mDataTMMVersion.innerText = `TMM: ${gameMetadata.tmmVersion}`;
    mDataDMLVersion.innerText = `DML: ${gameMetadata.dmlVersion}`;
}


async function getMods() {
    mods = await ipcRenderer.invoke('get-mods');
    const modsList = document.querySelector('.modslist');

    const table = document.createElement('table');
    table.innerHTML = `
    <thead>
      <tr>
        <th data-sort-key="priority" id="header-priority">Order</th>
        <th data-sort-key="name" id="header-name">Name</th>
        <th data-sort-key="enabled" id="header-enabled">Enabled</th>
        <th data-sort-key="description" id="header-description">Description</th>
        <th data-sort-key="author" id="header-author">Author</th>
        <th data-sort-key="version" id="header-version">Version</th>
<!--        <th data-sort-key="date" id="header-date">Date</th>-->
      </tr>
    </thead>
    <tbody>
    </tbody>
  `;
    tbody = table.querySelector('tbody');

    // Populate table rows


    populateRows(mods);




    // Add sorting event listeners
    const headers = table.querySelectorAll('th[data-sort-key]');
    headers.forEach(header => {
        header.style.cursor = 'pointer';
        let asc = true;

        header.addEventListener('click', () => {
            const sortKey = header.dataset.sortKey;
            const selectedModElement = document.querySelector('tr.selected > td:nth-child(2)');
            const selectedModName = selectedModElement ? selectedModElement.innerText : null;

            // Check if the same header was clicked again
            if (header.getAttribute('data-sorted') === 'true') {
                // Toggle the `asc` variable if the same header was clicked
                asc = !asc;
            } else {
                // Reset the `asc` variable if a different header was clicked
                asc = true;
            }

            // Pass the `asc` variable and the `selectedModName` to the `sortRows` function
            sortRows(sortKey, asc, selectedModName);

            // Mark all headers as unsorted
            headers.forEach(h => h.setAttribute('data-sorted', 'false'));

            // Mark the clicked header as sorted
            header.setAttribute('data-sorted', 'true');
        });
    });

    modsList.appendChild(table);
}

// Search function
function searchMods(mods, query) {
    const filteredMods = {};

    for (const modName in mods) {
        const mod = mods[modName];
        const searchString = `${modName} ${mod.description} ${mod.author} ${mod.version} ${mod.date}`.toLowerCase();

        if (searchString.includes(query.toLowerCase())) {
            filteredMods[modName] = mod;
        }
    }

    populateRows(filteredMods);
}

function populateRows(mods, selectedModName = null) {
    tbody.innerHTML = '';

    for (const modName in mods) {
        const mod = mods[modName];

        const row = document.createElement('tr');

        const priorityCell = document.createElement('td');
        priorityCell.appendChild(document.createTextNode(mod.priority !== null ? mod.priority : ''));
        row.appendChild(priorityCell);

        const modNameCell = document.createElement('td');
        modNameCell.appendChild(document.createTextNode(modName.replace(/^"(.*)"$/, '$1')));
        modNameCell.setAttribute('title', mod.name.replace(/^"(.*)"$/, '$1'));
        modNameCell.setAttribute('data-mod-name', modName.replace(/^"(.*)"$/, '$1'));
        row.appendChild(modNameCell);

        const enabledCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = mod.enabled;
        enabledCell.appendChild(checkbox);
        row.appendChild(enabledCell);

        const descriptionCell = document.createElement('td');
        descriptionCell.appendChild(document.createTextNode(mod.description ? mod.description.replace(/^"(.*)"$/, '$1') : ''));
        row.appendChild(descriptionCell);

        const authorCell = document.createElement('td');
        authorCell.appendChild(document.createTextNode(mod.author ? mod.author.replace(/^"(.*)"$/, '$1') : ''));
        row.appendChild(authorCell);

        const versionCell = document.createElement('td');
        versionCell.appendChild(document.createTextNode(mod.version ? mod.version.replace(/^"(.*)"$/, '$1') : ''));
        row.appendChild(versionCell);

        // TODO - impliment date correctly
        // const dateCell = document.createElement('td');
        // dateCell.appendChild(document.createTextNode(mod.date ? mod.date.replace(/^"(.*)"$/, '$1') : ''));
        // row.appendChild(dateCell);

        const updatableCell = document.createElement('td');
        const imageElement = document.createElement('img');

        if (mod.isupdatable) {
            imageElement.setAttribute('src', 'img/banana.svg');
            imageElement.setAttribute('class', 'gamebanana-icon icon');
            imageElement.setAttribute('id', `${mod.source}`);
            imageElement.setAttribute('alt', 'GameBanana Mod, Can be updated from Teto Mod Manager');
            imageElement.setAttribute('title', 'Installed via DMM or TMM, Can be updated from Teto Mod Manager');
        } else {
            imageElement.setAttribute('src', 'img/settings.svg');
            imageElement.setAttribute('class', 'settings-icon icon');
            imageElement.setAttribute('alt', 'Manually installed mod, cannot be updated from Teto Mod Manager')
            imageElement.setAttribute('title', 'Manually installed mod, cannot be updated from Teto Mod Manager')
        }



        updatableCell.appendChild(imageElement);
        row.appendChild(updatableCell);


        if (modName === selectedModName) {
            row.classList.add('selected');
        }
        row.classList.add('mod-row');

        row.addEventListener('click', () => {
            const selectedRows = document.querySelectorAll('tr.selected');
            selectedRows.forEach((selectedRow) => {
                selectedRow.classList.remove('selected');
            });
            row.classList.add('selected');
            showModInfo(mod);
        });

        checkbox.addEventListener('click', () => {
            ipcRenderer.invoke('set-mod-status', modName, checkbox.checked);
        });

        tbody.appendChild(row);
    }
}

// Add a keydown event listener to the document
document.addEventListener('keydown', (event) => {
    // Check if the pressed key is an up or down arrow key
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        // Find the currently selected row
        const selectedRow = document.querySelector('tr.selected');

        if (selectedRow) {
            event.preventDefault();
            if (event.key === 'ArrowUp') {
                moveSelectedRow(true, false)
            } else if (event.key === 'ArrowDown') {
                moveSelectedRow(false, true);
            }
        }
    } else if (event.key === 'Enter') {
        toggleModStatus();
    }
});


function handleGamepadInput() {
    // Get the first connected gamepad
    const gamepad = navigator.getGamepads()[0];

    if (gamepad) {
        // Define a deadzone for the analog stick
        const deadzone = 0.5;

        // Check if the analog stick is moved up or down or if the D-pad is pressed
        const moveUp = gamepad.axes[1] < -deadzone || gamepad.buttons[gamepadKeybinds.dpadUp].pressed;
        const moveDown = gamepad.axes[1] > deadzone || gamepad.buttons[gamepadKeybinds.dpadDown].pressed;

        if (moveUp || moveDown) {
            if (!gamepadHoldTimeout) {
                // Move the selected row
                moveSelectedRow(moveUp, moveDown);

                // Set a timeout for the hold behavior
                gamepadHoldTimeout = setTimeout(() => {
                    gamepadHoldTimeout = setInterval(() => {
                        moveSelectedRow(moveUp, moveDown);
                    }, 100);
                }, 500);
            }
        } else {
            // Clear the hold timeout and interval if the gamepad is not being pressed
            clearTimeout(gamepadHoldTimeout);
            clearInterval(gamepadHoldTimeout);
            gamepadHoldTimeout = null;
        }


        const aButtonPressed = gamepad.buttons[gamepadKeybinds.buttonConfirm].pressed;

        if (aButtonPressed && !currentlyHeldGamepadKeybinds.buttonConfirm) {
            currentlyHeldGamepadKeybinds.buttonConfirm = true;
            toggleModStatus();



        } else if (currentlyHeldGamepadKeybinds.buttonConfirm && !aButtonPressed) {
            currentlyHeldGamepadKeybinds.buttonConfirm = false;
        }

    }

    // Check for gamepad input again in the next animation frame
    requestAnimationFrame(handleGamepadInput);
}

function moveSelectedRow(moveUp, moveDown) {
    // Get the currently selected row
    let selectedRow = document.querySelector('tr.selected');

    // If there's no selected row, select the first row
    if (!selectedRow) {
        selectedRow = document.querySelector('tr.mod-row');
        if (selectedRow) {
            selectedRow.classList.add('selected');
        }
    }

    if (selectedRow) {
        let newRow;

        // Find the previous or next row based on the analog stick movement or D-pad buttons
        if (moveUp) {
            newRow = selectedRow.previousElementSibling;
        } else if (moveDown) {
            newRow = selectedRow.nextElementSibling;
        }

        // If there's a previous or next row, make it the new selected row
        if (newRow) {
            selectedRow.classList.remove('selected');
            newRow.classList.add('selected');
            gamepadShowModInfo();
            // Adjust the scroll position of the scrollable container
            const scrollableContainer = document.querySelector('.modslist');
            if (scrollableContainer) {
                const newRowRect = newRow.getBoundingClientRect();
                const containerRect = scrollableContainer.getBoundingClientRect();

                if (newRowRect.top < containerRect.top) {
                    scrollableContainer.scrollTop -= containerRect.top - newRowRect.top;
                } else if (newRowRect.bottom > containerRect.bottom) {
                    scrollableContainer.scrollTop += newRowRect.bottom - containerRect.bottom;
                }
            }
        }
    }
}



// Function to get profiles
async function getProfiles() {
    currentProfiles = await ipcRenderer.invoke('get-profiles');
    const profileSelector = document.getElementById('profile-selector');

    // remove any existing options
    while (profileSelector.firstChild) {
        profileSelector.removeChild(profileSelector.firstChild);
    }

    // Populate the dropdown with profile names
    for (const profileName in currentProfiles) {
        const option = document.createElement('option');
        option.value = profileName;
        option.innerText = profileName;
        profileSelector.appendChild(option);
    }



    // Set the active profile and update the mod list
    profileSelector.addEventListener('change', async () => {
        activeProfile = profileSelector.value;
        await ipcRenderer.invoke('set-active-profile', activeProfile);
        await reloadMods();
    });

    // Set the initial active profile
    activeProfile = await ipcRenderer.invoke('get-active-profile');
    //popupAlert('Active profile: ' + activeProfile.name)
    profileSelector.value = activeProfile.name;
}

// Function to update mod priority
async function updateModPriority(increase) {
    console.log('Updating mod priority');
    const selectedMod = document.querySelector('tr.selected');
    if (selectedMod) {
        const modName = selectedMod.querySelector('td:nth-child(2)').innerText; // Get the mod name from the second cell
        await ipcRenderer.invoke(increase ? 'increase-mod-priority' : 'decrease-mod-priority', modName);
        await reloadMods(modName); // Pass the mod name to the reloadMods function
    }
    ipcRenderer.invoke('update-mod-priorities');
}

// Update the DOMContentLoaded event listener
window.addEventListener('DOMContentLoaded', async () => {

    await getProfiles();
    await getMods();
    sortRows('priority', true);

    // Add event listeners for the buttons
    const launchGameButton = document.getElementById('launch-game');
    const openSettingsButton = document.getElementById('tmm-settings');
    const openGamebananaButton = document.getElementById('open-gamebanana');
    const installArchiveButton = document.getElementById('install-archive');
    const installGithubButton = document.getElementById('install-github');
    const reloadModsButton = document.getElementById('reload-mods');
    const searchInput = document.getElementById('search-input');
    const openModFolderButton = document.getElementById('open-folder');
    const increaseModPriorityButton = document.getElementById('increase-mod-priority');
    const decreaseModPriorityButton = document.getElementById('decrease-mod-priority');
    const createProfileButton = document.getElementById('create-profile');
    const deleteProfileButton = document.getElementById('delete-profile');
    const renameProfileButton = document.getElementById('rename-profile');
    const dmlSettingsButton = document.getElementById('dml-settings');
    const controllerSettingsButton = document.getElementById('controller-settings');
    const divaButton = document.getElementById('diva-settings');
    const openDevConsoleButton = document.getElementById('open-dev-console');




    launchGameButton.addEventListener('click', launchGame);
    reloadModsButton.addEventListener('click', reloadMods);
    openModFolderButton.addEventListener('click', openModFolder);
    searchInput.addEventListener('input', () => {
        searchMods(mods, searchInput.value);
    });
    increaseModPriorityButton.addEventListener('click', () => updateModPriority(true));
    decreaseModPriorityButton.addEventListener('click', () => updateModPriority(false));
    createProfileButton.addEventListener('click', async () => {
        const newProfileName = await popupPrompt('Enter a name for the new profile');
        if (newProfileName && newProfileName.length > 0) {
            ipcRenderer.invoke('create-profile', newProfileName).then(async () => {
                await getProfiles();
            });
        } else {
            popupAlert('Please enter a name for the profile');
        }
    });
    deleteProfileButton.addEventListener('click', async () => {
        if (await popupConfirm('Are you sure you want to delete this profile?')) {
            ipcRenderer.invoke('delete-profile', activeProfile.name).then(async () => {
                await getProfiles();
                const profileSelector = document.getElementById('profile-selector');
            });
        }

    });
    renameProfileButton.addEventListener('click', async () => {
        const newProfileName = await popupPrompt('Enter a new name for the profile', activeProfile);
        if (newProfileName && newProfileName.length > 0) {
            ipcRenderer.invoke('rename-profile', activeProfile.name, newProfileName).then(async () => {
                await getProfiles();
            }).then(async () => {
                const profileSelector = document.getElementById('profile-selector');
                currentProfiles = await ipcRenderer.invoke('get-profiles');
                profileSelector.value = newProfileName;
            });
        } else {
            popupAlert('Please enter a name for the profile');
        }
    });

    openSettingsButton.addEventListener('click', () => {
        // TODO - Add settings
       popupAlert('Settings coming soon!');
    });

    openGamebananaButton.addEventListener('click', async () => {
        // TODO - Add gamebanana integration
        await popupAlert('Gamebanana integration coming soon!')
        ipcRenderer.invoke('open-gamebanana');
    });

    installArchiveButton.addEventListener('click', async () => {
        // TODO - Add archive installation
        await popupAlert('Archive installation coming soon!')
    });

    installGithubButton.addEventListener('click', async () => {
        // TODO - Add github installation
        await popupAlert('Github installation coming soon!')
    });

    dmlSettingsButton.addEventListener('click', async () => {
        // TODO - Add dml settings
        await popupAlert('DML settings coming soon!')
    });

    controllerSettingsButton.addEventListener('click', async () => {
        // TODO - Add controller settings
        await popupAlert('Controller settings coming soon!')
    });

    divaButton.addEventListener('click', async () => {
        // TODO - Add diva settings
        await popupAlert('DIVA settings coming soon!')
    });

    openDevConsoleButton.addEventListener('click', async () => {
       ipcRenderer.invoke('open-dev-console');
    });







    ipcRenderer.invoke('update-mod-priorities');
    requestAnimationFrame(handleGamepadInput);

});

// Toggles selected mod for gamepad and keyboard input
function toggleModStatus() {
    const selectedRow = document.querySelector('tr.selected');
    if (selectedRow) {
        const checkbox = selectedRow.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            const modName = selectedRow.querySelector('td[title]').getAttribute('data-mod-name');

            ipcRenderer.invoke('set-mod-status', modName, checkbox.checked);
        }
    }
}

async function gamepadShowModInfo() {
    const selectedRows = document.querySelectorAll('tr.selected');
    if (selectedRows.length === 1) {
        const modName = selectedRows[0].querySelector('td[title]').getAttribute('data-mod-name');
        const mod = await ipcRenderer.invoke('get-mod-value', modName);
        if (mod) {
            showModInfo(mod);
        }
    }

}



// Call the getMods function when the page has loaded
// Function to launch the game
async function launchGame() {
    await ipcRenderer.invoke('update-mod-priorities');
    ipcRenderer.send('launch-game');
}

function openModFolder() {
    ipcRenderer.send('open-mod-folder');
}

// Function to reload the mods
async function reloadMods(selectedModName = null) {
    mods = await ipcRenderer.invoke('get-mods');
    populateRows(mods, selectedModName); // Pass the selectedModName parameter to the populateRows function
    sortRows('priority', true, selectedModName);
    ipcRenderer.invoke('update-mod-priorities');


}

ipcRenderer.on('get-path-from-user', async () => {
    const result = await popupPrompt('Could not find path to game folder. Enter the path to the game folder');
    ipcRenderer.send('returned-path-from-user', result);
});

ipcRenderer.on('alert-user', async (event, alertMessage) => {

    popupAlert(alertMessage);
});

ipcRenderer.on('debug-message', async (event, debugMessage) => {
    console.log(debugMessage);
});

// Function to show the mod info in the mod info panel when selected
function showModInfo(mod) {
    const modInfoPanel = document.getElementById('mod-info-panel');
    console.log(JSON.stringify(mod));

    if (modInfoPanel) {
        while (modInfoPanel.firstChild) {
            modInfoPanel.removeChild(modInfoPanel.firstChild);
        }
    }

    const modName = document.createElement('h2');
    modName.textContent = mod.name.replace(/^[! \s"']*([\s\S]*?)[! \s"']*$/, '$1');
    modInfoPanel.appendChild(modName);


    const modImageLink = (fs.existsSync(mod.banner) || /\.(jpeg|jpg|gif|png)$/i.test(mod.banner)) ? mod.banner : 'img/no-image.png';
    const modImage = document.createElement('img');
    modImage.src = modImageLink;
    modImage.classList.add('mod-image');
    modInfoPanel.appendChild(modImage);

    if (mod.descriptionLong) {
        mod.description = mod.descriptionLong;
    }

    const descriptionLines = mod.description.split('\n');

    descriptionLines.forEach((line) => {
        const modDescription = document.createElement('p');
        modDescription.textContent = line.replace(/^"(.*)"$/, '$1');
        modInfoPanel.appendChild(modDescription);
    });


    if (mod.author) {
        const modAuthor = document.createElement('p');
        modAuthor.textContent = `Author: ${mod.author.replace(/^"(.*)"$/, '$1')}`;
        modInfoPanel.appendChild(modAuthor);
    }

    if (mod.version) {
        const modVersion = document.createElement('p');
        modVersion.textContent = `Version: ${mod.version.replace(/^"(.*)"$/, '$1')}`;
        modInfoPanel.appendChild(modVersion);
    }

    if (mod.isupdatable) {
        const modUpdate = document.createElement('p');
        modUpdate.textContent = `Mod is updatable via TMM`
        modInfoPanel.appendChild(modUpdate);
    }
}


// Web layout functions

function showDialog({ message, input = false, buttons }) {
    const dialogOverlay = document.getElementById("dialog-overlay");
    const dialogBox = document.getElementById("dialog-box");
    const dialogMessage = document.getElementById("dialog-message");
    const dialogInput = document.getElementById("dialog-input");
    const dialogButtons = document.getElementById("dialog-buttons");

    dialogMessage.textContent = message;
    dialogInput.hidden = !input;
    dialogInput.value = "";
    dialogButtons.innerHTML = "";

    buttons.forEach(({ text, handler }) => {
        const button = document.createElement("button");
        button.textContent = text;
        button.onclick = () => {
            handler();
            dialogOverlay.style.display = "none";
            dialogBox.style.display = "none";
        };
        dialogButtons.appendChild(button);
    });

    dialogOverlay.style.display = "block";
    dialogBox.style.display = "block";
}

function popupAlert(message) {
    showDialog({
        message,
        buttons: [{ text: "OK", handler: () => {} }],
    });
}

function popupConfirm(message) {
    return new Promise((resolve) => {
        showDialog({
            message,
            buttons: [
                { text: "Cancel", handler: () => resolve(false) },
                { text: "OK", handler: () => resolve(true) },
            ],
        });
    });
}

function popupPrompt(message) {
    return new Promise((resolve) => {
        showDialog({
            message,
            input: true,
            buttons: [
                { text: "Cancel", handler: () => resolve("") },
                { text: "OK", handler: () => {
                        const dialogInput = document.getElementById("dialog-input");
                        resolve(dialogInput.value);
                    }},
            ],
        });
    });
}

