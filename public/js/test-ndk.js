// Use jsdelivr CDN which has better browser compatibility
import NDK from "https://cdn.jsdelivr.net/npm/@nostr-dev-kit/ndk@2.8.2/+esm";

const relays = [
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nostr.mom"
];

const ndk = new NDK({ explicitRelayUrls: relays });

const notesContainer = document.getElementById("notes-container");

/**
 * Creates and appends a post element to the DOM.
 * @param {object} event The Nostr event object.
 */
function createPostElement(event) {
    const postElement = document.createElement("div");
    postElement.className = "post";
    
    const content = document.createElement("pre");
    content.textContent = event.content;
    
    const pubkey = document.createElement("small");
    pubkey.textContent = `Posted by: ${event.pubkey.slice(0, 8)}...`;
    
    postElement.appendChild(content);
    postElement.appendChild(pubkey);
    
    notesContainer.appendChild(postElement);
}

// Main function to connect and fetch notes
async function fetchAndDisplayNotes() {
    await ndk.connect();
    console.log("NDK connected to relays");

    // Define a filter to get the 20 most recent text notes (kind 1)
    const filter = {
        kinds: [1],
        limit: 20,
    };
    
    // Fetch events from the relays
    const events = await ndk.fetchEvents(filter);

    if (events.size === 0) {
        notesContainer.textContent = "No notes found.";
        return;
    }

    // Clear previous notes and display the new ones
    notesContainer.innerHTML = '';
    
    // Display each note
    events.forEach(event => {
        createPostElement(event);
    });
}

// Run the function when the page loads
document.addEventListener("DOMContentLoaded", fetchAndDisplayNotes);
