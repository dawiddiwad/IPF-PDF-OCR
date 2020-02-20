const pdfjsLib = require('pdfjs-dist');
const Tesseract = require('tesseract.js');
const Canvas = require("canvas");
const assert = require("assert").strict;
const fs = require("fs");
const path = require('path');

const filesPath = './pdf-files/';
const zoom = 3;
let pdfFiles;

async function fetchDir(){
  let filesNamesInDir = await fs.readdirSync(filesPath).filter(function (e) {
    return path.extname(e).toLowerCase() === '.pdf';
  });
  pdfFiles = [];
  for (let fileName of filesNamesInDir){
    console.log(fileName);
    pdfFiles.push(filesPath + fileName);
  }
}

async function scrapPdfContent(fileName){
  let pdf = await pdfjsLib.getDocument(fileName);
  let page = await pdf.getPage(1);
  let viewport = page.getViewport({ scale: zoom });

  viewport.transform = [zoom, 0, 0, -zoom, -viewport.width / 2.5, viewport.height];
  let canvasFactory = new NodeCanvasFactory();
  let canvasAndContext = canvasFactory.create(
    viewport.width / 2,
    viewport.height / 5,
  );
  let renderContext = {
    canvasContext: canvasAndContext.context,
    viewport: viewport,
    canvasFactory: canvasFactory,
  };

  const scheduler = await Tesseract.createScheduler();
  const worker = await Tesseract.createWorker();
  await scheduler.addWorker(worker);

  await page.render(renderContext);
  let image = canvasAndContext.canvas.toBuffer();

  const { data: { text } } = await scheduler.addJob('recognize', image);
  console.log(text);
}

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, "Invalid canvas size");
    let canvas = Canvas.createCanvas(width, height);
    let context = canvas.getContext("2d");
    return {
      canvas: canvas,
      context: context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, "Canvas is not specified");
    assert(width > 0 && height > 0, "Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, "Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

async function analyzeFiles(){
  await fetchDir();
  for (let fileName of pdfFiles){
    await scrapPdfContent(fileName);
  }
}

analyzeFiles();
