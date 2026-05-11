// ===== State =====
let downloads = JSON.parse(localStorage.getItem('blakvipd_downloads') || '[]');
let activeDownloads = new Map();
let cooldownTimer = null;

// ===== DOM Elements =====
const urlInput = document.getElementById('urlInput');
const downloadBtn = document.getElementById('downloadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressSpeed = document.getElementById('progressSpeed');
const statusText = document.getElementById('statusText');
const downloadsList = document.getElementById('downloadsList');
const libraryGrid = document.getElementById('libraryGrid');
const emptyState = document.getElementById('emptyState');
const clearBtn = document.getElementById('clearBtn');
const videoModal = document.getElementById('videoModal');
const videoPlayer = document.getElementById('videoPlayer');
const videoTitle = document.getElementById('videoTitle');
const closeModal = document.getElementById('closeModal');
const toast = document.getElementById('toast');
const darkModeToggle = document.getElementById('darkModeToggle');

// ===== Tab Navigation =====
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(tab + '-tab').classList.add('active');

        if (tab === 'library') renderLibrary();
    });
});

// ===== Download Function =====
downloadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const format = document.querySelector('input[name="format"]:checked').value;

    if (!url) {
        showToast('ألصق رابطاً أولاً', 'error');
        return;
    }

    if (!isValidUrl(url)) {
        showToast('الرابط غير صالح', 'error');
        return;
    }

    // Cooldown
    startCooldown();

    const fileName = generateFileName(url, format);
    const id = Date.now().toString();

    const downloadItem = {
        id,
        url,
        fileName,
        format,
        progress: 0,
        status: 'waiting',
        speed: '0 KB/s',
        size: 0,
        date: new Date().toISOString()
    };

    activeDownloads.set(id, downloadItem);
    renderActiveDownloads();

    try {
        await downloadFile(downloadItem);
    } catch (err) {
        console.error(err);
    }
});

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function generateFileName(url, ext) {
    try {
        const urlObj = new URL(url);
        let name = urlObj.pathname.split('/').pop() || 'media';
        name = name.replace(/\.[^/.]+$/, '');
        if (!name) name = 'media_' + Date.now();
        return name + '.' + ext;
    } catch {
        return 'media_' + Date.now() + '.' + ext;
    }
}

function startCooldown() {
    downloadBtn.disabled = true;
    downloadBtn.classList.add('cooldown');
    let seconds = 15;

    const update = () => {
        downloadBtn.innerHTML = `<i class="fas fa-clock"></i><span>انتظر ${seconds}ث</span>`;
        seconds--;
        if (seconds >= 0) {
            cooldownTimer = setTimeout(update, 1000);
        } else {
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('cooldown');
            downloadBtn.innerHTML = `<i class="fas fa-download"></i><span>تحميل</span>`;
        }
    };
    update();
}

// ===== Download with Progress =====
async function downloadFile(item) {
    item.status = 'downloading';
    renderActiveDownloads();

    progressContainer.style.display = 'block';
    statusText.textContent = 'جاري الاتصال...';

    try {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const total = parseInt(response.headers.get('content-length')) || 0;
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        const startTime = Date.now();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
            received += value.length;

            // Progress
            const progress = total ? Math.round((received / total) * 100) : 0;
            item.progress = progress;

            // Speed
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? Math.round((received / 1024) / elapsed) : 0;
            item.speed = speed + ' KB/s';
            item.size = received;

            // Update UI
            progressFill.style.width = progress + '%';
            progressPercent.textContent = progress + '%';
            progressSpeed.textContent = item.speed;
            statusText.textContent = progress < 100 ? 'جاري التحميل...' : 'اكتمل!';

            renderActiveDownloads();
        }

        // Combine chunks
        const blob = new Blob(chunks);
        const blobUrl = URL.createObjectURL(blob);

        // Save to downloads
        item.status = 'completed';
        item.blobUrl = blobUrl;
        item.size = blob.size;
        downloads.unshift(item);
        saveDownloads();

        // Auto download
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = item.fileName;
        a.click();

        showToast('تم التحميل بنجاح!', 'success');

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
            urlInput.value = '';
        }, 2000);

    } catch (error) {
        item.status = 'error';
        item.error = error.message;
        renderActiveDownloads();
        showToast('خطأ: ' + error.message, 'error');
        statusText.textContent = 'خطأ!';
    }

    activeDownloads.delete(item.id);
}

// ===== Render Active Downloads =====
function renderActiveDownloads() {
    downloadsList.innerHTML = '';

    activeDownloads.forEach(item => {
        const div = document.createElement('div');
        div.className = 'download-item';
        div.innerHTML = `
            <div class="download-icon">
                <i class="fas fa-${item.format === 'mp4' ? 'video' : 'music'}"></i>
            </div>
            <div class="download-info">
                <div class="download-name">${escapeHtml(item.fileName)}</div>
                <div class="download-meta">
                    <span>${item.progress}%</span>
                    <span>${item.speed}</span>
                </div>
            </div>
            <span class="download-status status-${item.status}">${getStatusText(item.status)}</span>
        `;
        downloadsList.appendChild(div);
    });
}

function getStatusText(status) {
    const map = {
        waiting: 'في الانتظار',
        downloading: 'جاري التحميل',
        completed: 'اكتمل',
        error: 'خطأ'
    };
    return map[status] || status;
}

// ===== Render Library =====
function renderLibrary() {
    libraryGrid.innerHTML = '';

    if (downloads.length === 0) {
        emptyState.style.display = 'block';
        clearBtn.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    clearBtn.style.display = 'flex';

    downloads.forEach(item => {
        const div = document.createElement('div');
        div.className = 'library-item';
        div.innerHTML = `
            <div class="library-thumb">
                <i class="fas fa-${item.format === 'mp4' ? 'video' : 'music'}"></i>
                ${item.format === 'mp4' ? '<div class="play-overlay"><i class="fas fa-play"></i></div>' : ''}
            </div>
            <div class="library-details">
                <div class="library-name">${escapeHtml(item.fileName)}</div>
                <div class="library-size">${formatSize(item.size)} · ${formatDate(item.date)}</div>
            </div>
        `;

        div.addEventListener('click', () => {
            if (item.format === 'mp4' && item.blobUrl) {
                openVideoPlayer(item);
            } else if (item.blobUrl) {
                // Re-download
                const a = document.createElement('a');
                a.href = item.blobUrl;
                a.download = item.fileName;
                a.click();
            }
        });

        libraryGrid.appendChild(div);
    });
}

// ===== Video Player =====
function openVideoPlayer(item) {
    videoTitle.textContent = item.fileName;
    videoPlayer.src = item.blobUrl;
    videoModal.classList.add('active');
    videoPlayer.play();
}

closeModal.addEventListener('click', () => {
    videoModal.classList.remove('active');
    videoPlayer.pause();
    videoPlayer.src = '';
});

videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) {
        closeModal.click();
    }
});

// ===== Clear Library =====
clearBtn.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من مسح جميع التحميلات؟')) {
        downloads.forEach(d => {
            if (d.blobUrl) URL.revokeObjectURL(d.blobUrl);
        });
        downloads = [];
        saveDownloads();
        renderLibrary();
        showToast('تم المسح', 'success');
    }
});

// ===== Dark Mode =====
darkModeToggle.addEventListener('change', (e) => {
    document.body.classList.toggle('light-mode', e.target.checked);
    localStorage.setItem('blakvipd_darkmode', e.target.checked);
});

// Load dark mode preference
if (localStorage.getItem('blakvipd_darkmode') === 'true') {
    darkModeToggle.checked = true;
    document.body.classList.add('light-mode');
}

// ===== Helpers =====
function saveDownloads() {
    localStorage.setItem('blakvipd_downloads', JSON.stringify(downloads));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA');
}

function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast ' + type;

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== Init =====
console.log('BlakVipD Web loaded!');
