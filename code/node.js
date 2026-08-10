const express = require('express');
const serverless = require('serverless-http');
const multer = require('multer');
const { PDFDocument, rgb } = require('pdf-lib');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 1. 静态资源托管：把 /static 映射到 code/static 目录
app.use('/static', express.static(path.join(__dirname, 'static')));

// 2. 首页路由：返回 code/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 单位转换常量 (1mm = 2.83465 pt)
const MM = 2.83465;

// 辅助绘制印刷裁切线与对位角线
function drawMarksAndGrid(page, paperW, paperH, cardW, cardH, cols, rows, startXLeft, startXRight, startY, gutterX, gutterY, isA3) {
  const lineDistY = 1.0 * MM;
  const lineDistX = 5.0 * MM;
  const paperMargin = 3.0 * MM;
  const markLen = 6.0 * MM;

  const xPositions = isA3 ? [
    startXLeft,
    startXLeft + cardW + gutterX,
    startXRight,
    startXRight + cardW + gutterX
  ] : [
    startXLeft,
    startXLeft + cardW + gutterX
  ];

  const gridTopY = startY + rows * cardH + (rows - 1) * gutterY;

  // 垂直角线
  for (const xLeft of xPositions) {
    const xRight = xLeft + cardW;
    page.drawLine({ start: { x: xLeft, y: gridTopY + lineDistY }, end: { x: xLeft, y: paperH - paperMargin }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: xRight, y: gridTopY + lineDistY }, end: { x: xRight, y: paperH - paperMargin }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: xLeft, y: startY - lineDistY }, end: { x: xLeft, y: paperMargin }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: xRight, y: startY - lineDistY }, end: { x: xRight, y: paperMargin }, thickness: 0.4, color: rgb(0, 0, 0) });
  }

  const firstX = xPositions[0];
  const lastX = xPositions[xPositions.length - 1] + cardW;

  // 水平角线
  for (let row = 0; row < rows; row++) {
    const yBottom = startY + row * (cardH + gutterY);
    const yTop = yBottom + cardH;

    page.drawLine({ start: { x: firstX - lineDistX, y: yBottom }, end: { x: firstX - lineDistX - markLen, y: yBottom }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: firstX - lineDistX, y: yTop }, end: { x: firstX - lineDistX - markLen, y: yTop }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: lastX + lineDistX, y: yBottom }, end: { x: lastX + lineDistX + markLen, y: yBottom }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: lastX + lineDistX, y: yTop }, end: { x: lastX + lineDistX + markLen, y: yTop }, thickness: 0.4, color: rgb(0, 0, 0) });

    if (isA3) {
      const centerX = paperW / 2.0;
      const armLen = 8.0 * MM;
      page.drawLine({ start: { x: centerX - armLen, y: yBottom }, end: { x: centerX + armLen, y: yBottom }, thickness: 0.4, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: centerX - armLen, y: yTop }, end: { x: centerX + armLen, y: yTop }, thickness: 0.4, color: rgb(0, 0, 0) });
    }
  }

  if (isA3) {
    const centerA3Line = paperW / 2.0;
    const armLen = 8.0 * MM;
    page.drawLine({ start: { x: centerA3Line, y: paperMargin }, end: { x: centerA3Line, y: paperH - paperMargin }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: centerA3Line - armLen, y: gridTopY }, end: { x: centerA3Line + armLen, y: gridTopY }, thickness: 0.4, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: centerA3Line - armLen, y: startY }, end: { x: centerA3Line + armLen, y: startY }, thickness: 0.4, color: rgb(0, 0, 0) });
  }
}

// 3. 名片拼版 API 处理接口
app.post('/imposition', upload.fields([{ name: 'front' }, { name: 'back' }]), async (req, res) => {
  try {
    const paperChoice = req.body.paper_choice || '1';
    const useBleed = req.body.use_bleed === 'true';

    const frontFile = req.files['front'] ? req.files['front'][0] : null;
    const backFile = req.files['back'] ? req.files['back'][0] : null;

    if (!frontFile || !backFile) {
      return res.status(400).send('缺少名片图片文件');
    }

    const cardW = 90.0 * MM;
    const cardH = 54.0 * MM;
    const gutterX = 3.0 * MM;
    const gutterY = 3.0 * MM;
    const bleed = useBleed ? 1.5 * MM : 0.0;
    const a4BlockW = 2 * cardW + gutterX;

    let paperW, paperH, cols, rows, isA3;

    if (String(paperChoice) === '1') {
      paperW = 420.0 * MM;
      paperH = 297.0 * MM;
      cols = 4;
      rows = 5;
      isA3 = true;
    } else {
      paperW = 210.0 * MM;
      paperH = 297.0 * MM;
      cols = 2;
      rows = 5;
      isA3 = false;
    }

    let startXLeft, startXRight, xPositions;
    if (isA3) {
      const a4W = paperW / 2.0;
      startXLeft = (a4W - a4BlockW) / 2.0;
      startXRight = a4W + startXLeft;
      xPositions = [startXLeft, startXLeft + cardW + gutterX, startXRight, startXRight + cardW + gutterX];
    } else {
      startXLeft = (paperW - a4BlockW) / 2.0;
      startXRight = startXLeft;
      xPositions = [startXLeft, startXLeft + cardW + gutterX];
    }

    const gridH = rows * cardH + (rows - 1) * gutterY;
    const startY = (paperH - gridH) / 2.0;

    const pdfDoc = await PDFDocument.create();

    // 图像兼容嵌入函数
    const embedImage = async (file) => {
      try {
        if (file.mimetype === 'image/png') {
          return await pdfDoc.embedPng(file.buffer);
        }
        return await pdfDoc.embedJpg(file.buffer);
      } catch (e) {
        return await pdfDoc.embedJpg(file.buffer);
      }
    };

    const frontImg = await embedImage(frontFile);
    const backImg = await embedImage(backFile);

    // 第 1 页：正面
    const page1 = pdfDoc.addPage([paperW, paperH]);
    drawMarksAndGrid(page1, paperW, paperH, cardW, cardH, cols, rows, startXLeft, startXRight, startY, gutterX, gutterY, isA3);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = xPositions[col];
        const y = startY + (rows - 1 - row) * (cardH + gutterY);
        page1.drawImage(frontImg, {
          x: x - bleed,
          y: y - bleed,
          width: cardW + 2 * bleed,
          height: cardH + 2 * bleed,
        });
      }
    }

    // 第 2 页：背面（镜像翻转排版）
    const page2 = pdfDoc.addPage([paperW, paperH]);
    drawMarksAndGrid(page2, paperW, paperH, cardW, cardH, cols, rows, startXLeft, startXRight, startY, gutterX, gutterY, isA3);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const mirrorCol = (cols - 1) - col;
        const x = xPositions[mirrorCol];
        const y = startY + (rows - 1 - row) * (cardH + gutterY);
        page2.drawImage(backImg, {
          x: x - bleed,
          y: y - bleed,
          width: cardW + 2 * bleed,
          height: cardH + 2 * bleed,
        });
      }
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Business_Cards_Imposition.pdf');
    res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error(err);
    res.status(500).send('拼版生成失败: ' + err.message);
  }
});

// 本地开发模式启动监听
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:3000`);
  });
}

// 导出 Serverless Handler
module.exports.handler = serverless(app);