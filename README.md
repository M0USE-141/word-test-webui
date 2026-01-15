# BSU-test-master

## Formula rendering (Word-free fallback)

If Word COM rendering fails or is unavailable, the app can convert OMML formulas to MathML and render them with MathJax.
To enable the fallback renderer, install the optional dependencies:

```bash
pip install lxml cairosvg
npm install
```

The OMML-to-MathML transform is provided by `resources/omml2mml.xsl`.
