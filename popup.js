// popup.js

let selectedEmailId = null;

document.addEventListener("DOMContentLoaded", () => {
  // Set up the login and logout button visibility
  updateLoginState();

  // Set up the "Load More Emails" button
  const loadMoreButton = document.getElementById("loadMoreButton");
  loadMoreButton.addEventListener("click", () => {
    loadEmailList(true); // Pass true to indicate fetching more emails
  });
  // Set up the search functionality
  const searchButton = document.getElementById("searchButton");
  searchButton.addEventListener("click", () => {
    const query = document.getElementById("searchInput").value.trim();
    if (query) {
      searchEmails(query);
    } else {
      loadEmailList(); // Reload the regular list if no search query
    }
  });
  // Set up the summarize button
  document.getElementById("summarizeButton").addEventListener("click", () => {
    if (selectedEmailId) {
      summarizeSelectedEmail(selectedEmailId);
    } else {
      displayError("Please select an email to summarize.");
    }
  });

  const draftReplyButton = document.getElementById("draftReplyButton");
  const toneSelectReply = document.getElementById("toneSelectReply");

  // Draft a reply with selected tone
  draftReplyButton.addEventListener("click", async () => {
    if (selectedEmailId) {
      const tone = toneSelectReply.value;
      draftReplyForEmail(selectedEmailId, tone);
      console.log("Drafting reply with tone:", tone);
    } else {
      displayError("Please select an email to draft a reply.");
    }
  });

  // Send the reply
  document.getElementById("sendReplyButton").addEventListener("click", () => {
    const draftContent = document.getElementById("draftTextarea").value;
    if (selectedEmailId && draftContent.trim()) {
      sendReply(selectedEmailId, draftContent);
    } else {
      displayError(
        "Please select an email and ensure your draft is not empty."
      );
    }
  });

  // Set up the logout button
  document
    .getElementById("logoutButton")
    .addEventListener("click", handleLogout);

  // Add event listener to the log-in button
  document.getElementById("loginButton").addEventListener("click", handleLogin);
});

// Function to search for emails based on a query
function searchEmails(query) {
  document.getElementById("loadingEmails").style.display = "block";
  document.getElementById("emailList").innerHTML = ""; // Clear existing list items

  chrome.runtime.sendMessage({ action: "searchEmails", query }, (emails) => {
    document.getElementById("loadingEmails").style.display = "none";
    if (chrome.runtime.lastError) {
      displayError("Error retrieving email search results.");
      return;
    }

    const emailListContainer = document.getElementById("emailList");

    emails.forEach((email) => {
      const emailItem = document.createElement("p");
      emailItem.classList.add("emailItem");
      emailItem.textContent = `From: ${email.from} | Subject: ${email.subject}`;
      emailItem.dataset.emailId = email.id;
      emailItem.dataset.emailSender = email.from;
      emailItem.dataset.emailSubject = email.subject;

      emailItem.addEventListener("click", () => {
        selectEmailItem(emailItem);
      });

      emailListContainer.appendChild(emailItem);
    });
  });
}

// Function to load the list of emails into the scrollable list with sender information
function loadEmailList(fetchMore = false) {
  // Show loading message for emails and hide other messages
  document.getElementById("loadingEmails").style.display = "block";
  document.getElementById("summaryContainer").style.display = "none";
  document.getElementById("errorMessage").style.display = "none";

  // If not fetching more, clear existing list items
  if (!fetchMore) {
    document.getElementById("emailList").innerHTML = "";
  }

  chrome.runtime.sendMessage(
    { action: "listMessages", fetchMore },
    (emails) => {
      document.getElementById("loadingEmails").style.display = "none";
      if (chrome.runtime.lastError) {
        displayError("Error retrieving email list.");
        return;
      }

      const emailListContainer = document.getElementById("emailList");

      emails.forEach((email) => {
        const emailItem = document.createElement("p");
        emailItem.classList.add("emailItem");
        emailItem.textContent = `From: ${email.from} | Subject: ${email.subject}`;
        emailItem.dataset.emailId = email.id;
        emailItem.dataset.emailSender = email.from;
        emailItem.dataset.emailSubject = email.subject;

        emailItem.addEventListener("click", () => {
          selectEmailItem(emailItem);
        });

        emailListContainer.appendChild(emailItem);
      });

      // Show or hide the "Load More Emails" button based on nextPageToken
      const loadMoreButton = document.getElementById("loadMoreButton");
      loadMoreButton.style.display = emails.length > 0 ? "block" : "none";
    }
  );
}

// Function to handle selecting an email item
// Modify the part where you load the email content:
function selectEmailItem(emailItem) {
  // Deselect any previously selected email
  const previousSelection = document.querySelector(".selected");
  if (previousSelection) {
    previousSelection.classList.remove("selected");
  }

  // Mark the clicked item as selected
  emailItem.classList.add("selected");
  selectedEmailId = emailItem.dataset.emailId;
  document.getElementById("summarizeButton").disabled = false;

  // Update the email details in the UI
  document.getElementById(
    "emailSender"
  ).textContent = `From: ${emailItem.dataset.emailSender}`;
  document.getElementById(
    "emailSubject"
  ).textContent = `Subject: ${emailItem.dataset.emailSubject}`;
  document.getElementById("emailDetailsContainer").style.display = "block";

  // Fetch and display the email content
  chrome.runtime.sendMessage(
    { action: "getEmailContent", emailId: selectedEmailId },
    (response) => {
      if (response && response.body) {
        // Display the email content as HTML
        const contentContainer = document.getElementById("emailContent");
        contentContainer.innerHTML = response.body
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
          .replace(/<meta[\s\S]*?>/gi, "");

        document.getElementById("emailDetailsContainer").style.display =
          "block";
      } else {
        displayError("Error fetching email content.");
      }
    }
  );
}

// Function to summarize the selected email
function summarizeSelectedEmail(emailId, accessToken) {
  // Show loading message for summary and hide other messages
  document.getElementById("loadingSummary").style.display = "block";
  document.getElementById("summaryContainer").style.display = "none";
  document.getElementById("errorMessage").style.display = "none";

  chrome.runtime.sendMessage(
    {
      action: "getEmailContentAndSummarize",
      emailId: emailId,
      accessToken: accessToken,
    },
    (response) => {
      document.getElementById("loadingSummary").style.display = "none"; // Hide loading message

      if (chrome.runtime.lastError || !response || !response.summary) {
        displayError("Error summarizing the email or no summary available.");
      } else {
        displaySummary(response.summary);
      }
    }
  );
}

// Function to display the summary in the popup
function displaySummary(summary) {
  const summaryText = document.getElementById("summaryText");
  summaryText.textContent = summary;

  document.getElementById("summaryContainer").style.display = "block";
}

// Function to display an error message in the popup
function displayError(message) {
  const errorMessage = document.getElementById("errorMessage");
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function handleLogin() {
  // Trigger the login process
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error("Failed to get access token:", chrome.runtime.lastError);
      displayError("Login failed. Please try again.");
    } else {
      console.log("Successfully obtained access token:", token);
      // Refresh or load the email list upon successful login
      updateLoginState();
      loadEmailList();
    }
  });
}

// Handle user logout
function handleLogout() {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      // Step 1: Invalidate the token by sending a request to Google's token revocation endpoint
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`, {
        method: "POST",
      })
        .then(() => {
          console.log("Token invalidated on Google's side.");

          // Step 2: Clear the token from Chrome's cache
          chrome.identity.removeCachedAuthToken({ token }, () => {
            console.log("Access token cleared from Chrome's cache.");
            // Optional: Reload the extension popup or reset the UI
            updateLoginState();
            window.location.reload();
          });
        })
        .catch((error) => {
          console.error("Error revoking token on Google's side:", error);
          // Proceed to clear the token from Chrome's cache regardless of the error
          chrome.identity.removeCachedAuthToken({ token }, () => {
            console.log(
              "Access token cleared from Chrome's cache despite revocation error."
            );
            updateLoginState();
            window.location.reload();
          });
        });
    } else {
      console.warn("No token found to remove.");
    }
  });
}

// Update login/logout button visibility based on login state
function updateLoginState() {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (token) {
      // User is logged in
      document.getElementById("loginButton").style.display = "none";
      document.getElementById("logoutButton").style.display = "block";
      // Load email list if logged in
      loadEmailList();
    } else {
      // User is logged out
      document.getElementById("loginButton").style.display = "block";
      document.getElementById("logoutButton").style.display = "none";
    }
  });
}

// Function to draft a reply for the selected email
async function draftReplyForEmail(emailId, tone) {
  document.getElementById("loadingDraft").style.display = "block"; // Show loading message

  chrome.runtime.sendMessage(
    { action: "draftReply", emailId: emailId, tone: tone },
    (response) => {
      document.getElementById("loadingDraft").style.display = "none"; // Hide loading message
      console.log("Drafting reply for email with tone:", tone);
      if (chrome.runtime.lastError || !response || !response.draft) {
        displayError("Error drafting the reply.");
      } else {
        displayDraft(response.draft);
      }
    }
  );
}

// Function to display the drafted reply
// Display the generated draft in an editable textarea
function displayDraft(draftText) {
  const draftTextarea = document.getElementById("draftTextarea");
  draftTextarea.value = draftText;
  document.getElementById("draftContainer").style.display = "block";
}

// Function to get the access token
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

// Function to send the edited reply using the Gmail API
async function sendReply(emailId, replyContent) {
  const accessToken = await getAccessToken();
  try {
    // Fetch the original email's metadata (to obtain threadId)
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=metadata`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const emailData = await response.json();
    const threadId = emailData.threadId;

    // Prepare the reply email
    const rawMessage = createRawEmail(replyContent, emailData.payload.headers);

    // Send the reply
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: rawMessage,
          threadId: threadId,
        }),
      }
    );

    alert("Reply sent successfully!");
  } catch (error) {
    console.error("Error sending the reply:", error);
    displayError("Error sending the reply.");
  }
}

// Helper function to create the raw email content for sending
function createRawEmail(replyContent, headers) {
  const toHeader = headers.find((header) => header.name === "From").value;
  const subjectHeader = headers.find(
    (header) => header.name === "Subject"
  ).value;
  const replySubject = subjectHeader.startsWith("Re:")
    ? subjectHeader
    : `Re: ${subjectHeader}`;

  // Format the raw email (basic example)
  const email = [
    `To: ${toHeader}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${
      headers.find((header) => header.name === "Message-ID").value
    }`,
    `References: ${
      headers.find((header) => header.name === "Message-ID").value
    }`,
    "",
    replyContent,
  ].join("\r\n");

  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper function to display error messages
function displayError(message) {
  const errorMessage = document.getElementById("errorMessage");
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

// Add event listener to the "Send Email" button
document.getElementById("sendEmailButton").addEventListener("click", () => {
  window.location.href = "send_email.html"; // Navigate to the send email page
});
