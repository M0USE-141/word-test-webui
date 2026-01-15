import express from "express";
import multer from "multer";
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { xsltProcess } from "xslt-processor";
import { DOMParser } from "@xmldom/xmldom";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const XML_PRESERVE = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
const XML_SIMPLE = new XMLParser({ ignoreAttributes: false });
const XML_BUILD = new XMLBuilder({ ignoreAttributes: false, preserveOrder: true });

const OMML_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/extract", upload.single("docx"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    const zip = await JSZip.loadAsync(req.file.buffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("text");

    if (!documentXml) {
      return res.status(400).json({ error: "document.xml not found in DOCX." });
    }

    const rels = relsXml ? buildRelationshipMap(relsXml) : new Map();
    const ommlXslt = await loadOmmlXslt();

    const items = await extractItems(documentXml, zip, rels, ommlXslt);
    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to extract document." });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});

function buildRelationshipMap(xml) {
  const parsed = XML_SIMPLE.parse(xml);
  const rels = parsed.Relationships?.Relationship ?? [];
  const list = Array.isArray(rels) ? rels : [rels];
  const map = new Map();
  for (const rel of list) {
    if (rel?.["@_Id"] && rel?.["@_Target"]) {
      map.set(rel["@_Id"], rel["@_Target"]);
    }
  }
  return map;
}

async function loadOmmlXslt() {
  const xsltPath = path.join(__dirname, "resources", "omml2mml.xsl");
  try {
    return await fs.readFile(xsltPath, "utf-8");
  } catch (error) {
    console.warn("OMML XSLT not found:", xsltPath);
    return null;
  }
}

async function extractItems(documentXml, zip, rels, ommlXslt) {
  const parsed = XML_PRESERVE.parse(documentXml);
  const bodyNodes = findBodyNodes(parsed);
  const items = [];
  for (const node of bodyNodes) {
    await walkNode(node, items, { zip, rels, ommlXslt });
  }
  return items.filter((item) => item.type !== "text" || item.text.trim() !== "");
}

function findBodyNodes(parsed) {
  const documentNode = findNode(parsed, "w:document");
  if (!documentNode) {
    return [];
  }
  const bodyNode = findNode(documentNode, "w:body");
  if (!bodyNode) {
    return [];
  }
  return getChildren(bodyNode);
}

function findNode(nodes, tag) {
  if (!Array.isArray(nodes)) {
    return null;
  }
  for (const node of nodes) {
    const keys = Object.keys(node).filter((key) => key !== ":@");
    for (const key of keys) {
      if (key === tag) {
        return node[key];
      }
      const found = findNode(node[key], tag);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function getChildren(node) {
  return Array.isArray(node) ? node : [];
}

async function walkNode(node, items, context) {
  if (!node || typeof node !== "object") {
    return;
  }

  const keys = Object.keys(node).filter((key) => key !== ":@");
  for (const key of keys) {
    const children = node[key];
    switch (key) {
      case "w:p":
      case "w:r":
      case "w:body":
        await walkChildren(children, items, context);
        break;
      case "w:t": {
        const text = extractText(children);
        if (text) {
          items.push({ type: "text", text });
        }
        break;
      }
      case "w:tab":
        items.push({ type: "text", text: "\t" });
        break;
      case "w:br":
        items.push({ type: "text", text: "\n" });
        break;
      case "w:drawing":
        await addImageFromDrawing(children, items, context);
        break;
      case "m:oMath":
      case "m:oMathPara":
        addMathFromOmml(node, key, items, context);
        break;
      case "w:tbl":
        await walkTable(children, items, context);
        break;
      default:
        await walkChildren(children, items, context);
        break;
    }
  }
}

async function walkChildren(children, items, context) {
  if (!Array.isArray(children)) {
    return;
  }
  for (const child of children) {
    if (child?.["#text"]) {
      continue;
    }
    await walkNode(child, items, context);
  }
}

async function walkTable(children, items, context) {
  if (!Array.isArray(children)) {
    return;
  }
  for (const child of children) {
    const key = Object.keys(child).find((k) => k !== ":@");
    if (key === "w:tr" || key === "w:tc" || key === "w:tbl") {
      await walkChildren(child[key], items, context);
    } else {
      await walkNode(child, items, context);
    }
  }
}

function extractText(children) {
  if (!Array.isArray(children)) {
    return "";
  }
  let text = "";
  for (const child of children) {
    if (child?.["#text"]) {
      text += child["#text"];
    }
  }
  return text;
}

async function addImageFromDrawing(children, items, context) {
  const embed = findEmbedId(children);
  if (!embed) {
    return;
  }
  const target = context.rels.get(embed);
  if (!target) {
    return;
  }
  const normalized = target.startsWith("media/") ? `word/${target}` : `word/${target}`;
  const file = context.zip.file(normalized);
  if (!file) {
    return;
  }
  const buffer = await file.async("nodebuffer");
  const ext = path.extname(target).slice(1).toLowerCase();
  const mime = mimeForExtension(ext);
  const base64 = buffer.toString("base64");
  items.push({ type: "image", src: `data:${mime};base64,${base64}` });
}

function findEmbedId(children) {
  if (!Array.isArray(children)) {
    return null;
  }
  for (const child of children) {
    const key = Object.keys(child).find((k) => k !== ":@");
    if (!key) {
      continue;
    }
    if (key === "a:blip") {
      const attrs = child[":@"] || {};
      return attrs["@_r:embed"] || attrs["@_r:link"] || null;
    }
    const found = findEmbedId(child[key]);
    if (found) {
      return found;
    }
  }
  return null;
}

function mimeForExtension(ext) {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function addMathFromOmml(node, key, items, context) {
  if (!context.ommlXslt) {
    return;
  }
  const ommlNode = { [key]: node[key] };
  let ommlXml = XML_BUILD.build([ommlNode]);
  if (!ommlXml.includes("xmlns:m=")) {
    ommlXml = ommlXml.replace(
      `<${key}`,
      `<${key} xmlns:m="${OMML_NS}"`
    );
  }

  try {
    const mathml = transformOmmlToMathml(ommlXml, context.ommlXslt);
    if (mathml) {
      items.push({ type: "math", mathml });
    }
  } catch (error) {
    console.warn("OMML transform failed", error);
  }
}

function transformOmmlToMathml(ommlXml, xslt) {
  const domParser = new DOMParser();
  const ommlDoc = domParser.parseFromString(ommlXml, "text/xml");
  const xsltDoc = domParser.parseFromString(xslt, "text/xml");
  const result = xsltProcess(ommlDoc, xsltDoc);
  if (typeof result === "string") {
    return result;
  }
  if (result?.toString) {
    return result.toString();
  }
  return null;
}
