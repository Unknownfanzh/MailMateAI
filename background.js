// Description: This script contains the background logic for the Chrome extension.

// Function to search for emails based on a query using the Gmail API
async function searchEmails(query) {
  try {
    const accessToken = await getAccessToken(); // Obtain access token for authorization
    console.log(`Searching emails with query: ${query}`);
    
    // Construct the search URL with query and parameters
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.append("maxResults", "20");
    url.searchParams.append("q", query); // Include search query

    // Fetch search results from Gmail API
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    console.log("Search results fetched:", data);

    if (!data.messages) return [];

    // Retrieve metadata for each search result
    const emails = await Promise.all(
      data.messages.map(async (msg) => {
        const emailData = await getEmailMetadata(msg.id, accessToken);
        return emailData;
      })
    );

    // Sort emails by timestamp in descending order (newest first)
    emails.sort((a, b) => b.timestamp - a.timestamp);
    return emails;
  } catch (error) {
    console.error("Error searching emails:", error);
    return [];
  }
}

let summarizer; // Summarizer instance for AI-generated summaries

// Function to initialize the summarizer model using AI capabilities
async function initializeSummarizer() {
  const canSummarize = await ai.summarizer.capabilities();
  if (canSummarize && canSummarize.available !== "no") {
    summarizer = await ai.summarizer.create();
    if (canSummarize.available !== "readily") {
      summarizer.addEventListener("downloadprogress", (e) => {
        console.log(`Downloading summarizer model: ${e.loaded}/${e.total}`);
      });
      await summarizer.ready;
    }
  } else {
    console.error("Summarizer model is not available.");
  }
}

// Initialize the summarizer on extension load
initializeSummarizer();

// Function to obtain an access token for Gmail API requests
async function getAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error(chrome.runtime.lastError);
        chrome.identity.removeCachedAuthToken({ token }, () => {
          chrome.identity.getAuthToken({ interactive: true }, (newToken) => {
            if (chrome.runtime.lastError || !newToken) {
              console.error("Failed to get new access token");
            } else {
              resolve(newToken);
            }
          });
        });
      } else {
        resolve(token);
      }
    });
  });
}

let nextPageToken = null; // Variable for pagination in listing messages

// Function to list messages from Gmail inbox with optional pagination
async function listMessages(fetchMore = false) {
  try {
    const accessToken = await getAccessToken(); // Obtain access token
    console.log("Starting to list messages...");
    
    // Construct URL with pagination parameters
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.append("maxResults", "20");
    if (fetchMore && nextPageToken) {
      url.searchParams.append("pageToken", nextPageToken); // Use next page token if available
    }

    // Fetch messages from Gmail API
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    console.log("Messages fetched:", data);

    if (!data.messages) return [];

    // Update next page token for future fetches
    nextPageToken = data.nextPageToken || null;

    // Retrieve metadata for each message
    const emails = await Promise.all(
      data.messages.map(async (msg) => {
        const emailData = await getEmailMetadata(msg.id, accessToken);
        return emailData;
      })
    );

    // Sort emails by timestamp in descending order
    emails.sort((a, b) => b.timestamp - a.timestamp);
    return emails;
  } catch (error) {
    console.error("Error listing messages:", error);
    return [];
  }
}

// Function to get additional metadata of an email, such as subject and sender
async function getEmailMetadata(emailId, accessToken) {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=metadata`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();

    if (!data.payload || !data.payload.headers) {
      console.warn(`Unexpected data structure for email ID: ${emailId}`, data);
      return { id: emailId, subject: "(No Subject)", from: "(Unknown Sender)", timestamp: 0 };
    }

    const headers = data.payload.headers;
    const subject = headers.find((header) => header.name === "Subject")?.value || "(No Subject)";
    const from = headers.find((header) => header.name === "From")?.value || "(Unknown Sender)";
    const timestamp = data.internalDate ? parseInt(data.internalDate, 10) : 0;

    return { id: emailId, subject, from, timestamp };
  } catch (error) {
    console.error("Error fetching email metadata:", error);
    return null;
  }
}

// Function to decode Base64-encoded content
function decodeBase64(encoded) {
  const decoded = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  try {
    return decodeURIComponent(escape(decoded)); // Handle Unicode characters correctly
  } catch (e) {
    return decoded; // Fallback if decoding fails
  }
}

// Function to recursively extract plain text content from email parts
function getEmailText(parts) {
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      return decodeBase64(part.body.data); // Return plain text content
    } else if (part.mimeType === "text/html") {
      return stripHtml(decodeBase64(part.body.data)); // Use HTML content as fallback
    } else if (part.parts) {
      const text = getEmailText(part.parts); // Recursively check nested parts
      if (text) {
        return text;
      }
    }
  }
  return null;
}

// Helper function to clean up HTML content by removing tags, URLs, etc.
function stripHtml(html) {
  return html
    .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
    .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
    .replace(/\bwww\.\S+\.\S+\b/g, "") // Remove "www" URLs
    .replace(/\S+@\S+\.\S+/g, "") // Remove email addresses
    .replace(/Unsubscribe|Follow Us|Preferences|Update Preferences|Manage Your Preferences|Contact Us|Read More|Read Online/g, "") // Remove common footer words
    .replace(/\s{2,}/g, " ") // Remove extra whitespace
    .trim();
}

// Function to fetch and display full content of an email
async function getEmailContentForShow(emailId, accessToken) {
  try {
    console.log("Fetching email content for ID:", emailId);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();
    console.log("Email content fetched:", data);

    let body = "";
    if (data.payload && data.payload.parts) {
      body = getHtmlContent(data.payload.parts); // Get HTML content if available
    } else if (data.payload && data.payload.body && data.payload.body.data) {
      body = decodeBase64(data.payload.body.data); // Use body content if available
    }

    return { body, snippet: data.snippet }; // Return email body and snippet
  } catch (error) {
    console.error("Error fetching email content:", error);
    return null;
  }
}

// Function to fetch and extract plain text content from an email
async function getEmailContent(emailId, accessToken) {
  try {
    console.log("Fetching email content for ID:", emailId);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();
    console.log("Email content fetched:", data);

    let body = "";
    if (data.payload && data.payload.parts) {
      body = stripHtml(getEmailText(data.payload.parts)); // Extract text and clean up HTML content
    } else if (data.payload && data.payload.body && data.payload.body.data) {
      body = stripHtml(decodeBase64(data.payload.body.data));
    }

    return { body, snippet: data.snippet }; // Return cleaned body text and snippet
  } catch (error) {
    console.error("Error fetching email content:", error);
    return null;
  }
}

// Function to recursively extract HTML content
function getHtmlContent(parts) {
  for (const part of parts) {
    if (part.mimeType === "text/html") {
      return decodeBase64(part.body.data); // Return HTML content
    } else if (part.parts) {
      const html = getHtmlContent(part.parts); // Recursively check nested parts
      if (html) {
        return html;
      }
    }
  }
  return "";
}

// Function to summarize email content using AI summarizer
async function summarizeEmailContent(emailContent) {
  try {
    if (!summarizer) {
      console.error("Summarizer is not initialized.");
      return null;
    }
    console.log("Summarizing email content:", emailContent);
    const result = await summarizer.summarize(emailContent);
    console.log("Summary result:", result);
    return result;
  } catch (error) {
    console.error("Error summarizing email content:", error);
    return null;
  }
}

let draftSession; // Drafting session instance for AI-generated replies

// Initialize AI session for drafting replies
async function initializeDraftSession() {
  const capabilities = await ai.languageModel.capabilities();
  if (capabilities.available !== "no") {
    draftSession = await ai.languageModel.create({
      systemPrompt: "You are a helpful AI assistant that drafts professional and polite email replies.",
    });
  } else {
    console.error("Language model is not available.");
  }
}

// Function to draft a reply to an email using AI
async function draftReply(prompt) {
  if (!draftSession) {
    await initializeDraftSession();
  }

  try {
    const draft = await draftSession.prompt(prompt);
    return draft;
  } catch (error) {
    console.error("Error generating draft reply:", error);
    return "Error drafting reply.";
  }
}

// Function to fetch email content and draft a reply
async function getEmailContentAndDraftReply(emailId, accessToken, tone) {
  const emailContent = await getEmailContent(emailId, accessToken);
  const prompt = `Please draft a reply to the following email with a ${tone} tone: "${emailContent.body}"`;
  const draftReplyText = await draftReply(prompt);
  return draftReplyText;
}

// Listener for messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "listMessages") {
    listMessages(message.fetchMore)
      .then((emailIds) => sendResponse(emailIds))
      .catch((error) => {
        console.error("Error in listMessages:", error);
        sendResponse([]);
      });
    return true;
  } else if (message.action === "searchEmails") {
    searchEmails(message.query)
      .then((emailIds) => sendResponse(emailIds))
      .catch((error) => {
        console.error("Error in searchEmails:", error);
        sendResponse([]);
      });
    return true;
  } else if (message.action === "getEmailSnippet") {
    getAccessToken().then((accessToken) => {
      getEmailContent(message.emailId, accessToken)
        .then((emailContent) => sendResponse({ snippet: emailContent.snippet }))
        .catch((error) => {
          console.error("Error fetching email snippet:", error);
          sendResponse(null);
        });
    });
    return true;
  } else if (message.action === "getEmailContent") {
    getAccessToken().then((accessToken) => {
      getEmailContentForShow(message.emailId, accessToken)
        .then((emailContent) => {
          if (emailContent) {
            sendResponse({ body: emailContent.body });
          } else {
            sendResponse({ body: "Error fetching content." });
          }
        })
        .catch((error) => {
          console.error("Error fetching email content:", error);
          sendResponse({ body: "Error fetching content." });
        });
    });
    return true;
  } else if (message.action === "getEmailContentAndSummarize") {
    getAccessToken().then((accessToken) => {
      getEmailContent(message.emailId, accessToken)
        .then((emailContent) => {
          const contentToSummarize = emailContent.body || emailContent.snippet;
          return summarizeEmailContent(contentToSummarize).then((summary) => ({
            emailContent,
            summary,
          }));
        })
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error("Error in getEmailContentAndSummarize:", error);
          sendResponse(null);
        });
    });
    return true;
  } else if (message.action === "draftReply") {
    getAccessToken().then((accessToken) => {
      getEmailContentAndDraftReply(message.emailId, accessToken, message.tone)
        .then((draftReplyText) => sendResponse({ draft: draftReplyText }))
        .catch((error) => {
          console.error("Error drafting reply:", error);
          sendResponse({ draft: "Error drafting reply." });
        });
    });
    return true;
  }
});
