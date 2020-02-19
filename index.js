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

function scrapPdfContent(fileName){
  pdfjsLib.getDocument(fileName).then(function(pdf){
    pdf.getPage(1).then(function(page){
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
      let renderTask = page.render(renderContext);
      renderTask.promise.then(function(){
        let image = canvasAndContext.canvas.toBuffer();
        Tesseract.recognize(image, 'pol', 
        { logger: m => console.log(m),
          rectangles: [{ top: 0.1, left: 0.1, width: 0.1, height: 0.1 }] }
        ).then(({ data: { text } }) => {
          console.log(text);
          })
        fs.writeFile(fileName + '.png', image, function(error){
        })
      })
    });
  })
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
    scrapPdfContent(fileName);
  }
}

analyzeFiles();
