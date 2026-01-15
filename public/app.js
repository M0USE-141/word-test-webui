const form = document.getElementById("upload-form");
const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = form.querySelector("input[type=file]");
  if (!fileInput.files.length) {
    return;
  }

  const formData = new FormData();
  formData.append("docx", fileInput.files[0]);

  statusEl.textContent = "Uploading and extracting...";
  outputEl.innerHTML = "";

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Extraction failed.");
    }

    renderItems(payload.items || []);
    statusEl.textContent = `Extracted ${payload.items.length} items.`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

function renderItems(items) {
  outputEl.innerHTML = "";
  for (const item of items) {
    if (item.type === "text") {
      const span = document.createElement("span");
      span.className = "text";
      span.textContent = item.text;
      outputEl.appendChild(span);
    } else if (item.type === "image") {
      const img = document.createElement("img");
      img.className = "image";
      img.src = item.src;
      img.alt = "Extracted image";
      outputEl.appendChild(img);
    } else if (item.type === "math") {
      const wrapper = document.createElement("span");
      wrapper.className = "math";
      wrapper.innerHTML = item.mathml;
      outputEl.appendChild(wrapper);
    }
  }

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise([outputEl]);
  }
}
