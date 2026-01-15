# BSU-test-master

## Node.js extractor

This version runs a Node.js web server that accepts DOCX uploads and extracts text, images, and OMML formulas in order.
Formulas are converted with XSLT (OMML → MathML) and rendered in the browser via MathJax.

### Setup

```bash
npm install
npm start
```

Open <http://localhost:3000> and upload a DOCX file.

### Notes

* The OMML-to-MathML transform lives in `resources/omml2mml.xsl`.
* Extracted images are served as inline data URLs.
