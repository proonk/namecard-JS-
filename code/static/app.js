document.addEventListener('DOMContentLoaded', () => {
    // 设置正面与背面预览逻辑
    setupFileUpload('front', 'dropZoneFront', 'contentFront', 'previewFront', 'imgPreviewFront', 'namePreviewFront', 'changeBtnFront');
    setupFileUpload('back', 'dropZoneBack', 'contentBack', 'previewBack', 'imgPreviewBack', 'namePreviewBack', 'changeBtnBack');

    const form = document.getElementById('impositionForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');

    // 使用 Fetch API 实现无刷新自动下载 PDF
    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // 阻止常规页面跳转

        // 切换为 Loading 状态
        btnText.classList.add('d-none');
        btnLoading.classList.remove('d-none');
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const response = await fetch('/imposition', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('拼版生成失败');
            }

            // 获取 PDF 文件流并用 Blob 触发浏览器直接下载
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'Business_Cards_Imposition.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

        } catch (error) {
            alert('生成失败，请检查上传的图片格式！');
            console.error(error);
        } finally {
            // 恢复按钮状态，页面停留原位可直接换图再次提交
            btnText.classList.remove('d-none');
            btnLoading.classList.add('d-none');
            submitBtn.disabled = false;
        }
    });
});

// 处理图片预览与更换
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
            
            // 读取文件并渲染缩略图
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

    // 点击更换按钮触发重新选择
    changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
    });

    // 拖拽文件样式反馈
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