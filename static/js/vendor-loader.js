const CHART_JS_SRC =
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
const MATHJAX_SRC =
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";

let chartJsPromise = null;
let mathJaxPromise = null;

function loadExternalScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    });
    document.head.appendChild(script);
  });
}

export function ensureChartJsLoaded() {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }
  if (!chartJsPromise) {
    chartJsPromise = loadExternalScript(CHART_JS_SRC, "chartjs-script")
      .then(() => window.Chart)
      .catch((error) => {
        chartJsPromise = null;
        throw error;
      });
  }
  return chartJsPromise;
}

export function ensureMathJaxLoaded() {
  if (window.MathJax?.typesetPromise) {
    return Promise.resolve(window.MathJax);
  }
  if (!mathJaxPromise) {
    mathJaxPromise = loadExternalScript(MATHJAX_SRC, "mathjax-script")
      .then(() => window.MathJax)
      .catch((error) => {
        mathJaxPromise = null;
        throw error;
      });
  }
  return mathJaxPromise;
}
