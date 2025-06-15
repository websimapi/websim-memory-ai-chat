import "websim";

const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const memoryDisplay = document.getElementById('memory-display');
const memoryContent = document.getElementById('memory-content');

let conversationHistory = [];
let projectMemories = [];
const MAX_PROMPT_LENGTH = 512;
const MEMORY_TAG_PREFIX = '<!-- MEMORY_ID: ';
const MEMORY_TAG_SUFFIX = ' -->';

// Function to truncate text
const truncateText = (text, maxLength) => {
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
    }
    return text;
};

// Function to fetch project history and build memories
const fetchProjectHistory = async () => {
    try {
        const currentProject = await websim.getCurrentProject();
        if (!currentProject) {
            console.log("No current project found.");
            return;
        }

        const projectId = currentProject.id;
        const revisionsResponse = await fetch(`/api/v1/projects/${projectId}/revisions`);
        const revisionsData = await revisionsResponse.json();

        if (revisionsData && revisionsData.revisions && revisionsData.revisions.data) {
            projectMemories = revisionsData.revisions.data
                .map(item => {
                    // Assuming the prompt text is stored in the site associated with the revision
                    // This might need adjustment based on where prompt text is actually accessible
                    // from revisions. If not directly available, we might need another API call
                    // or adjust based on actual websim structure.
                    // For now, let's assume the prompt text is available via the site object.
                    const site = item.site;
                    if (site && site.prompt && site.prompt.text) {
                        return {
                            id: `${projectId}_v${item.project_revision.version}`,
                            projectId: projectId,
                            version: item.project_revision.version,
                            promptText: site.prompt.text
                        };
                    }
                    return null;
                })
                .filter(memory => memory !== null); // Filter out entries where prompt text wasn't found

            console.log("Fetched project memories:", projectMemories);
            // Optionally display a list of available memories somewhere or use them internally
        }
    } catch (error) {
        console.error("Failed to fetch project history:", error);
    }
};

// Call this function on page load
fetchProjectHistory();

// Function to display a message in the chat box
const displayMessage = (text, sender) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = text;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to the latest message
};

// Function to display the active memory
const displayActiveMemory = (memoryId) => {
    const memory = projectMemories.find(mem => mem.id === memoryId);
    if (memory) {
        const truncatedText = truncateText(memory.promptText, MAX_PROMPT_LENGTH);
        memoryContent.innerHTML = `
            <strong>Project:</strong> ${memory.projectId}<br>
            <strong>Version:</strong> ${memory.version}<br>
            <strong>Prompt:</strong> ${truncatedText}
        `;
    } else {
         memoryContent.textContent = 'None';
    }
};

// Function to send a message
const sendMessage = async () => {
    const text = userInput.value.trim();
    if (text === '') return;

    displayMessage(text, 'user');
    conversationHistory.push({ role: 'user', content: text });
    userInput.value = '';
    sendButton.disabled = true; // Disable button while processing

    // Prepare memories for the AI prompt
    const memoriesText = projectMemories.length > 0
        ? "Project Memories:\n" + projectMemories.map(mem => `- ID: ${mem.id}, Text: "${truncateText(mem.promptText, 200)}" `).join('\n')
        : "No project memories available.";

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `You are an AI whose personality and responses are influenced by "Project Memories". These are texts from previous versions of the project you are in. Your goal is to converse naturally, incorporating insights or reflecting the tone/style present in these memories when relevant.

${memoriesText}

When your response is significantly influenced by a specific Project Memory (identified by its ID, e.g., "project_id_v1"), append the tag "${MEMORY_TAG_PREFIX}MEMORY_ID${MEMORY_TAG_SUFFIX}" to the very end of your response, replacing MEMORY_ID with the actual ID from the list above. Only include this tag if a memory strongly shaped your response. Do not include this tag otherwise.

Respond to the user's message.`,
                },
                ...conversationHistory.slice(-10), // Send last 10 messages + system
            ],
            model: 'claude-3-haiku-20240307', // Or another suitable model
        });

        let aiResponse = completion.content;
        let activeMemoryId = null;

        // Check for the memory tag in the response
        const tagIndex = aiResponse.lastIndexOf(MEMORY_TAG_PREFIX);
        if (tagIndex !== -1) {
            const suffixIndex = aiResponse.indexOf(MEMORY_TAG_SUFFIX, tagIndex + MEMORY_TAG_PREFIX.length);
            if (suffixIndex !== -1) {
                activeMemoryId = aiResponse.substring(tagIndex + MEMORY_TAG_PREFIX.length, suffixIndex);
                // Remove the tag from the displayed message
                aiResponse = aiResponse.substring(0, tagIndex).trim();
                console.log("Detected memory ID:", activeMemoryId);
            }
        }

        displayMessage(aiResponse, 'ai');
        conversationHistory.push({ role: 'assistant', content: aiResponse }); // Store cleaned response

        // Update memory display if a tag was found
        displayActiveMemory(activeMemoryId);

    } catch (error) {
        console.error("Error communicating with AI:", error);
        displayMessage("Sorry, I couldn't process your request right now.", 'ai');
        displayActiveMemory(null); // Clear memory display on error
    } finally {
        sendButton.disabled = false; // Re-enable button
    }
};

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Initial message
displayMessage("Hello! I'm an AI influenced by this project's past creations. What's on your mind?", 'ai');
displayActiveMemory(null); // Ensure memory display is initially clear


