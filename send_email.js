// Description: This file contains the code to generate an AI draft and send an email using the Gmail API.
// Initialize the AI model
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error("Failed to get access token:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// Initialize the AI model
document.addEventListener("DOMContentLoaded", () => {
  const generateDraftButton = document.getElementById("generateDraftButton");
  const sendEmailButton = document.getElementById("sendEmailButton");
  const loadingDraftMessage = document.getElementById("loadingDraftMessage");

  generateDraftButton.addEventListener("click", async () => {
    const prompt = document.getElementById("promptInput").value;
    const tone = document.getElementById("toneSelect").value;
    if (!prompt) {
      alert("Please enter a prompt to generate a draft.");
      return;
    }

    // Show the loading message
    loadingDraftMessage.style.display = "block";

    // Generate AI draft using the Prompt API
    const draftContent = await generateAIDraft(prompt, tone);
    // Hide the loading message once the draft is generated
    loadingDraftMessage.style.display = "none";

    document.getElementById("emailBodyTextarea").value = draftContent;
  });

  sendEmailButton.addEventListener("click", async () => {
    const recipient = document.getElementById("recipientInput").value;
    const subject = document.getElementById("subjectInput").value;
    const body = document.getElementById("emailBodyTextarea").value;

    if (!recipient || !subject || !body) {
      alert("Please fill out all fields before sending.");
      return;
    }

    // Call function to send the email
    await sendEmail(recipient, subject, body);
  });
});

// Function to generate an AI draft based on a prompt and tone
async function generateAIDraft(prompt, tone) {
  const capabilities = await ai.languageModel.capabilities();
  if (capabilities.available !== "no") {
    const session = await ai.languageModel.create();
    const result = await session.prompt(
      `Write an email with a ${tone} tone. ${prompt}`
    );
    return result; // Return generated text
  } else {
    alert("AI model is not available.");
    return "";
  }
}

// Function to send the email using the Gmail API
async function sendEmail(to, subject, body) {
  const accessToken = await getAccessToken();
  const rawMessage = createRawEmail(to, subject, body);

  try {
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: rawMessage }),
      }
    );
    alert("Email sent successfully!");
  } catch (error) {
    console.error("Error sending email:", error);
    alert("Failed to send email.");
  }
}

// Helper function to create raw email content
function createRawEmail(to, subject, body) {
  const email = [`To: ${to}`, `Subject: ${subject}`, "", body].join("\r\n");

  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Add event listener to go back button
document.getElementById('goBackButton').addEventListener('click', function() {
  window.location.href = 'popup.html'; // Redirect to popup.html
});
