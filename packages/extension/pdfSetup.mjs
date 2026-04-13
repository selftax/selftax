import * as pdfjsLib from './pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
