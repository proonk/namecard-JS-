document.addEventListener('DOMContentLoaded', () => {
    // 设置上传预览逻辑
    setupFileUpload('front', 'dropZoneFront', 'contentFront', 'previewFront', 'imgPreviewFront', 'namePreviewFront', 'changeBtnFront');
    setupFileUpload('back', 'dropZoneBack', 'contentBack', 'previewBack', 'imgPreviewBack', 'namePreviewBack', 'changeBtnBack');

    const form = document.getElementById('impositionForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');

    // 纯前端拼版处理函数（无需后端 Server）
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const frontImgSrc = document.getElementById('imgPreviewFront').src;
        const backImgSrc = document.getElementById('imgPreviewBack').src;

        if (!frontImgSrc || !backImgSrc) {
            alert('请上传名片正面与背面图片！');
            return;
        }

        btnText.classList.add('d-none');
        btnLoading.classList.remove('d-none');
        submitBtn.disabled = true;

        try {
            const paperChoice = document.getElementById('paper_choice').value;
            const useBleed = document.getElementById('use_bleed').checked;

            await new Promise(resolve => setTimeout(resolve, 100));

            // 1. 在浏览器内部直接生成 PDF 二进制文件
            const pdfBlob = await generateImpositionPDF(paperChoice, useBleed, frontImgSrc, backImgSrc);

            // 2. 自动触发下载
            const downloadUrl = window.URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'Business_Cards_Imposition.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            console.error('拼版生成失败:', error);
            alert('生成失败，请检查上传的图片文件！');
        } finally {
            btnText.classList.remove('d-none');
            btnLoading.classList.add('d-none');
            submitBtn.disabled = false;
        }
    });
});

// 核心功能：仅拉伸/延伸四周边框像素，不缩放、不移动中心文字与排版
async function extendImageEdges(imgSrc, bleedMm = 1.5, cardWMm = 90, cardHMm = 54) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const origW = img.naturalWidth;
            const origH = img.naturalHeight;

            // 根据原图像素密度计算 1.5mm 对应的像素大小
            const pxPerMm = origW / cardWMm;
            const bleedPxX = Math.round(bleedMm * pxPerMm);
            const bleedPxY = Math.round(bleedMm * (origH / cardHMm));

            canvas.width = origW + 2 * bleedPxX;
            canvas.height = origH + 2 * bleedPxY;

            // 1. 中间主体内容：100% 原始尺寸，文字与核心设计绝对不动
            ctx.drawImage(img, 0, 0, origW, origH, bleedPxX, bleedPxY, origW, origH);

            // 2. 顶部边缘像素向外延伸
            ctx.drawImage(img, 0, 0, origW, 2, bleedPxX, 0, origW, bleedPxY);
            // 3. 底部边缘像素向外延伸
            ctx.drawImage(img, 0, origH - 2, origW, 2, bleedPxX, bleedPxY + origH, origW, bleedPxY);
            // 4. 左侧边缘像素向外延伸
            ctx.drawImage(img, 0, 0, 2, origH, 0, bleedPxY, bleedPxX, origH);
            // 5. 右侧边缘像素向外延伸
            ctx.drawImage(img, origW - 2, 0, 2, origH, bleedPxX + origW, bleedPxY, bleedPxX, origH);

            // 6. 填补四个角（左上、右上、左下、右下）
            ctx.drawImage(img, 0, 0, 2, 2, 0, 0, bleedPxX, bleedPxY);
            ctx.drawImage(img, origW - 2, 0, 2, 2, bleedPxX + origW, 0, bleedPxX, bleedPxY);
            ctx.drawImage(img, 0, origH - 2, 2, 2, 0, bleedPxY + origH, bleedPxX, bleedPxY);
            ctx.drawImage(img, origW - 2, origH - 2, 2, 2, bleedPxX + origW, bleedPxY + origH, bleedPxX, bleedPxY);

            resolve(canvas.toDataURL('image/jpeg', 0.98));
        };
        img.onerror = reject;
        img.src = imgSrc;
    });
}

// 使用 jsPDF 库在浏览器端计算拼版与角线
async function generateImpositionPDF(paperChoice, useBleed, frontImgData, backImgData) {
    const { jsPDF } = window.jspdf;

    const mm = 1;
    const cardW = 90 * mm;
    const cardH = 54 * mm;
    const gutterX = 3 * mm;
    const gutterY = 3 * mm;
    const bleed = useBleed ? 1.5 * mm : 0 * mm;

    // 如果启用了出血，先用 Canvas 扩展边缘像素，中间文字不动
    const processedFront = useBleed ? await extendImageEdges(frontImgData, 1.5, 90, 54) : frontImgData;
    const processedBack = useBleed ? await extendImageEdges(backImgData, 1.5, 90, 54) : backImgData;

    let paperW, paperH, cols, rows, isA3;

    if (paperChoice === '1') {
        // A3 横向 (420mm x 297mm)
        paperW = 420;
        paperH = 297;
        cols = 4;
        rows = 5;
        isA3 = true;
    } else {
        // A4 竖向 (210mm x 297mm)
        paperW = 210;
        paperH = 297;
        cols = 2;
        rows = 5;
        isA3 = false;
    }

    const a4BlockW = 2 * cardW + gutterX;
    let startXLeft, startXRight, xPositions;

    if (isA3) {
        const a4W = paperW / 2.0;
        startXLeft = (a4W - a4BlockW) / 2.0;
        startXRight = a4W + startXLeft;
        xPositions = [
            startXLeft,
            startXLeft + cardW + gutterX,
            startXRight,
            startXRight + cardW + gutterX
        ];
    } else {
        startXLeft = (paperW - a4BlockW) / 2.0;
        startXRight = startXLeft;
        xPositions = [startXLeft, startXLeft + cardW + gutterX];
    }

    const gridH = rows * cardH + (rows - 1) * gutterY;
    const startY = (paperH - gridH) / 2.0;

    const doc = new jsPDF({
        orientation: isA3 ? 'landscape' : 'portrait',
        unit: 'mm',
        format: isA3 ? 'a3' : 'a4'
    });

    // 绘制裁切线与对位点
    function drawMarksAndGrid() {
        doc.setLineWidth(0.15);
        doc.setDrawColor(0, 0, 0);

        const lineDistY = 1.0;
        const lineDistX = 5.0;
        const paperMargin = 3.0;
        const markLen = 6.0;

        const gridTopY = startY;
        const firstX = xPositions[0];
        const lastX = xPositions[xPositions.length - 1] + cardW;

        // 垂直角线
        for (let i = 0; i < xPositions.length; i++) {
            const xLeft = xPositions[i];
            const xRight = xLeft + cardW;

            // 修改：只在左上角（i === 0）隐藏原有的顶部垂直线
            if (i !== 0) {
                doc.line(xLeft, 0 + paperMargin, xLeft, gridTopY - lineDistY);
            }
            
            doc.line(xRight, 0 + paperMargin, xRight, gridTopY - lineDistY);

            const gridBottomY = startY + gridH;
            doc.line(xLeft, gridBottomY + lineDistY, xLeft, paperH - paperMargin);
            doc.line(xRight, gridBottomY + lineDistY, xRight, paperH - paperMargin);
        }

        // 水平角线
        for (let row = 0; row < rows; row++) {
            const yTop = startY + row * (cardH + gutterY);
            const yBottom = yTop + cardH;

            // 修改：只在左上角（row === 0）隐藏原有的左侧水平线
            if (row !== 0) {
                doc.line(firstX - lineDistX - markLen, yTop, firstX - lineDistX, yTop);
            }
            
            doc.line(firstX - lineDistX - markLen, yBottom, firstX - lineDistX, yBottom);

            doc.line(lastX + lineDistX, yTop, lastX + lineDistX + markLen, yTop);
            doc.line(lastX + lineDistX, yBottom, lastX + lineDistX + markLen, yBottom);

            if (isA3) {
                const centerX = paperW / 2.0;
                const armLen = 8.0;
                doc.line(centerX - armLen, yTop, centerX + armLen, yTop);
                doc.line(centerX - armLen, yBottom, centerX + armLen, yBottom);
            }
        }

        // ==========================================
        // 新增：仅在左上角绘制独立的横线与独立的直角(L型)
        // ==========================================
        const cornerX = firstX;
        const cornerY = gridTopY;

        // 1. 独立的横线 (保持在左侧水平向外，并且不与直角相连)
        doc.line(cornerX - lineDistX - markLen, cornerY, cornerX - lineDistX - 2, cornerY);

        // 2. 独立的直角符号 (类似于 ┘ 形状，贴近实际裁切点)
        // 底部小横线
        doc.line(cornerX - 3, cornerY, cornerX, cornerY);
        // 右侧小竖线 (从裁切点往上画)
        doc.line(cornerX, cornerY - 3, cornerX, cornerY);
        // ==========================================

        if (isA3) {
            const centerA3Line = paperW / 2.0;
            const armLen = 8.0;
            const gridBottomY = startY + gridH;

            doc.line(centerA3Line, paperMargin, centerA3Line, paperH - paperMargin);
            doc.line(centerA3Line - armLen, startY, centerA3Line + armLen, startY);
            doc.line(centerA3Line - armLen, gridBottomY, centerA3Line + armLen, gridBottomY);
        }
    }

    // 第 1 页：正面
    drawMarksAndGrid();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = xPositions[col];
            const y = startY + row * (cardH + gutterY);
            doc.addImage(
                processedFront,
                'JPEG',
                x - bleed,
                y - bleed,
                cardW + 2 * bleed,
                cardH + 2 * bleed
            );
        }
    }

    // 第 2 页：背面（镜像翻转排版）
    doc.addPage();
    drawMarksAndGrid();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const mirrorCol = (cols - 1) - col;
            const x = xPositions[mirrorCol];
            const y = startY + row * (cardH + gutterY);
            doc.addImage(
                processedBack,
                'JPEG',
                x - bleed,
                y - bleed,
                cardW + 2 * bleed,
                cardH + 2 * bleed
            );
        }
    }

    return doc.output('blob');
}

// 图片拖拽与预览逻辑
function setupFileUpload(inputId, zoneId, contentId, previewId, imgId, nameId, changeBtnId) {
    const input = document.getElementById(inputId);
    const zone = document.getElementById(zoneId);
    const content = document.getElementById(contentId);
    const preview = document.getElementById(previewId);
    const img = document.getElementById(imgId);
    const name = document.getElementById(nameId);
    const changeBtn = document.getElementById(changeBtnId);

    input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
            const file = input.files[0];

            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
                name.textContent = file.name;

                content.classList.add('d-none');
                preview.classList.remove('d-none');
                zone.classList.add('has-file');
            };
            reader.readAsDataURL(file);
        }
    });

    changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
        });
    });
}