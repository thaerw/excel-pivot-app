let sessionId = null;
let columnsData = [];
let pivotConfig = {
    filters: {},
    rows: [],
    columns: [],
    values: []
};
let currentFilterColumn = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeUpload();
    initializeDragAndDrop();
});

// File Upload Handling
function initializeUpload() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

    uploadZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            fileInput.click();
        }
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) handleFileUpload(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileUpload(e.target.files[0]);
    });
}

function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    document.getElementById('uploadZone').innerHTML = `
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-3">Processing file...</p>
    `;

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showError(data.error);
            resetUploadZone();
            return;
        }

        sessionId = data.session_id;
        columnsData = data.columns;

        document.getElementById('fileName').textContent = data.filename;
        document.getElementById('rowCount').textContent = `${data.row_count} rows`;
        document.getElementById('fileInfo').style.display = 'block';
        document.getElementById('uploadZone').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';

        populateColumnsList(data.columns);
        loadDataPreview();
    })
    .catch(error => {
        showError('Error uploading file: ' + error.message);
        resetUploadZone();
    });
}

function resetUploadZone() {
    document.getElementById('uploadZone').innerHTML = `
        <i class="bi bi-file-earmark-excel display-1 text-success"></i>
        <p class="mt-3">Drag & drop your Excel file here or click to browse</p>
        <p class="text-muted small">Supported formats: .xlsx, .xls, .csv (Max 50MB)</p>
        <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" hidden>
        <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">
            <i class="bi bi-folder2-open"></i> Browse Files
        </button>
    `;
    document.getElementById('uploadZone').style.display = 'block';
    initializeUpload();
}

function populateColumnsList(columns) {
    const container = document.getElementById('columnsList');
    container.innerHTML = '';

    columns.forEach(col => {
        const item = document.createElement('div');
        item.className = `column-item ${col.type}`;
        item.draggable = true;
        item.dataset.column = col.name;
        item.dataset.type = col.type;

        const typeColors = {
            'numeric': 'success',
            'text': 'primary',
            'datetime': 'warning'
        };

        item.innerHTML = `
            <span class="column-name">${col.name}</span>
            <span class="badge bg-${typeColors[col.type]} type-badge">${col.type}</span>
        `;

        item.addEventListener('click', () => showColumnDetails(col));
        container.appendChild(item);
    });

    document.getElementById('columnSearch').addEventListener('input', function() {
        const search = this.value.toLowerCase();
        document.querySelectorAll('.column-item').forEach(item => {
            const name = item.dataset.column.toLowerCase();
            item.style.display = name.includes(search) ? '' : 'none';
        });
    });
}

function showColumnDetails(column) {
    const container = document.getElementById('columnDetails');
    const typeColor = column.type === 'numeric' ? 'success' : column.type === 'datetime' ? 'warning' : 'primary';
    
    container.innerHTML = `
        <div class="fade-in">
            <h6 class="border-bottom pb-2">${column.name}</h6>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="badge bg-${typeColor}">${column.type}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Data Type:</span>
                <span>${column.dtype}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Unique Values:</span>
                <span>${column.unique_count}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Missing Values:</span>
                <span>${column.null_count}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Sample Values:</span>
                <ul class="mb-0 ps-3">
                    ${column.sample.map(v => `<li>${v}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

function initializeDragAndDrop() {
    const zones = ['filtersZone', 'rowsZone', 'columnsZone', 'valuesZone'];
    
    zones.forEach(zoneId => {
        const zone = document.getElementById(zoneId);
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const columnName = e.dataTransfer.getData('text/plain');
            const columnType = e.dataTransfer.getData('column-type');
            if (columnName) {
                addColumnToZone(zoneId, columnName, columnType);
            }
        });
    });

    document.addEventListener('dragstart', (e) => {
        if (e.target.classList && e.target.classList.contains('column-item')) {
            e.dataTransfer.setData('text/plain', e.target.dataset.column);
            e.dataTransfer.setData('column-type', e.target.dataset.type);
            e.target.classList.add('dragging');
        }
    });

    document.addEventListener('dragend', (e) => {
        if (e.target.classList && e.target.classList.contains('column-item')) {
            e.target.classList.remove('dragging');
        }
    });
}

function addColumnToZone(zoneId, columnName, columnType) {
    const zone = document.getElementById(zoneId);
    const type = zone.dataset.type;

    if (type === 'filters') {
        if (pivotConfig.filters[columnName]) return;
        pivotConfig.filters[columnName] = [];
        openFilterModal(columnName);
    } else {
        if (pivotConfig[type].includes(columnName)) return;
        pivotConfig[type].push(columnName);
    }

    const placeholder = zone.querySelector('.placeholder-text');
    if (placeholder) placeholder.style.display = 'none';

    const item = document.createElement('span');
    item.className = 'dropped-item';
    item.dataset.column = columnName;
    
    const editIcon = type === 'filters' ? `<i class="bi bi-pencil-square ms-1" style="cursor:pointer" onclick="openFilterModal('${columnName}')"></i>` : '';
    
    item.innerHTML = `
        ${columnName}
        ${editIcon}
        <button class="remove-btn" onclick="removeFromZone('${zoneId}', '${columnName}')">×</button>
    `;
    zone.appendChild(item);

    updateCounts();
}

function removeFromZone(zoneId, columnName) {
    const zone = document.getElementById(zoneId);
    const type = zone.dataset.type;

    if (type === 'filters') {
        delete pivotConfig.filters[columnName];
        const filterSel = document.getElementById('filterSel_' + columnName.replace(/\s/g, '_'));
        if (filterSel) filterSel.remove();
    } else {
        pivotConfig[type] = pivotConfig[type].filter(c => c !== columnName);
    }

    const item = zone.querySelector(`[data-column="${columnName}"]`);
    if (item) item.remove();

    const items = zone.querySelectorAll('.dropped-item');
    if (items.length === 0) {
        const placeholder = zone.querySelector('.placeholder-text');
        if (placeholder) placeholder.style.display = '';
    }

    updateCounts();
}

function updateCounts() {
    document.getElementById('filterCount').textContent = Object.keys(pivotConfig.filters).length;
    document.getElementById('rowsCount').textContent = pivotConfig.rows.length;
    document.getElementById('columnsCount').textContent = pivotConfig.columns.length;
    document.getElementById('valuesCount').textContent = pivotConfig.values.length;
}

function openFilterModal(columnName) {
    currentFilterColumn = columnName;
    document.getElementById('filterColumnName').textContent = columnName;
    document.getElementById('filterValues').innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm"></div> Loading...</div>';
    document.getElementById('filterSearch').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('filterModal'));
    modal.show();

    fetch('/get_unique_values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, column: columnName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            document.getElementById('filterValues').innerHTML = `<p class="text-danger">${data.error}</p>`;
            return;
        }

        const currentFilters = pivotConfig.filters[columnName] || [];
        const container = document.getElementById('filterValues');
        
        container.innerHTML = data.unique_values.map((value, index) => `
            <div class="form-check">
                <input class="form-check-input filter-checkbox" type="checkbox" 
                       value="${value}" id="filter_${index}"
                       ${currentFilters.length === 0 || currentFilters.includes(value) ? 'checked' : ''}>
                <label class="form-check-label" for="filter_${index}">
                    ${value}
                </label>
            </div>
        `).join('');

        if (data.total_unique > 100) {
            container.innerHTML += `<p class="text-muted mt-2"><small>Showing first 100 of ${data.total_unique} unique values</small></p>`;
        }

        document.getElementById('filterSearch').addEventListener('input', function() {
            const search = this.value.toLowerCase();
            document.querySelectorAll('#filterValues .form-check').forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(search) ? '' : 'none';
            });
        });
    });
}

function selectAllFilters() {
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = true);
}

function deselectAllFilters() {
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = false);
}

function applyFilter() {
    const selectedValues = [];
    document.querySelectorAll('.filter-checkbox:checked').forEach(cb => {
        selectedValues.push(cb.value);
    });

    pivotConfig.filters[currentFilterColumn] = selectedValues;
    updateFilterDisplay(currentFilterColumn, selectedValues);
    bootstrap.Modal.getInstance(document.getElementById('filterModal')).hide();
}

function updateFilterDisplay(columnName, values) {
    const container = document.getElementById('filterSelections');
    let filterDiv = document.getElementById('filterSel_' + columnName.replace(/\s/g, '_'));
    
    if (!filterDiv) {
        filterDiv = document.createElement('div');
        filterDiv.id = 'filterSel_' + columnName.replace(/\s/g, '_');
        filterDiv.className = 'alert alert-secondary py-1 px-2 small';
        container.appendChild(filterDiv);
    }

    filterDiv.innerHTML = `<strong>${columnName}:</strong> ${values.length} values selected`;
}

function generatePivot() {
    if (pivotConfig.rows.length === 0 && pivotConfig.values.length === 0) {
        showError('Please select at least Rows or Values for the pivot table');
        return;
    }

    document.getElementById('pivotLoading').style.display = 'block';
    document.getElementById('pivotResult').style.display = 'none';

    fetch('/create_pivot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            rows: pivotConfig.rows,
            columns: pivotConfig.columns,
            values: pivotConfig.values,
            filters: pivotConfig.filters,
            aggfunc: document.getElementById('aggFunc').value,
            show_totals: document.getElementById('showTotals').checked
        })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('pivotLoading').style.display = 'none';
        document.getElementById('pivotResult').style.display = 'block';

        if (data.error) {
            document.getElementById('pivotResult').innerHTML = `
                <div class="alert alert-danger">${data.error}</div>
            `;
            return;
        }

        document.getElementById('pivotResult').innerHTML = `
            <div class="table-responsive fade-in">
                ${data.pivot_html}
            </div>
        `;

        document.getElementById('pivotActions').style.display = 'block';
        document.getElementById('pivotSummary').style.display = 'block';
        document.getElementById('pivotSummary').innerHTML = `
            <div class="row text-center">
                <div class="col-md-4">
                    <span class="badge bg-info">Rows Before Filter: ${data.summary.rows_before_filter}</span>
                </div>
                <div class="col-md-4">
                    <span class="badge bg-success">Rows After Filter: ${data.summary.rows_after_filter}</span>
                </div>
                <div class="col-md-4">
                    <span class="badge bg-primary">Pivot Size: ${data.summary.pivot_shape[0]} × ${data.summary.pivot_shape[1]}</span>
                </div>
            </div>
        `;
    })
    .catch(error => {
        document.getElementById('pivotLoading').style.display = 'none';
        document.getElementById('pivotResult').style.display = 'block';
        document.getElementById('pivotResult').innerHTML = `
            <div class="alert alert-danger">Error: ${error.message}</div>
        `;
    });
}

function loadDataPreview() {
    fetch('/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) return;

        let html = '<table class="table table-sm table-striped table-bordered">';
        html += '<thead><tr>' + data.columns.map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
        html += '<tbody>';
        data.data.forEach(row => {
            html += '<tr>' + data.columns.map(c => `<td>${row[c] || ''}</td>`).join('') + '</tr>';
        });
        html += '</tbody></table>';

        document.getElementById('dataPreview').innerHTML = html;
    });
}

function togglePreview() {
    const body = document.getElementById('previewBody');
    const icon = document.getElementById('previewToggleIcon');
    
    if (body.style.display === 'none') {
        body.style.display = '';
        icon.classList.remove('bi-chevron-up');
        icon.classList.add('bi-chevron-down');
    } else {
        body.style.display = 'none';
        icon.classList.remove('bi-chevron-down');
        icon.classList.add('bi-chevron-up');
    }
}

function resetConfiguration() {
    pivotConfig = { filters: {}, rows: [], columns: [], values: [] };
    
    ['filtersZone', 'rowsZone', 'columnsZone', 'valuesZone'].forEach(zoneId => {
        const zone = document.getElementById(zoneId);
        zone.querySelectorAll('.dropped-item').forEach(item => item.remove());
        const placeholder = zone.querySelector('.placeholder-text');
        if (placeholder) placeholder.style.display = '';
    });

    document.getElementById('filterSelections').innerHTML = '';
    document.getElementById('pivotResult').innerHTML = `
        <p class="text-muted text-center py-5">
            <i class="bi bi-arrow-up-circle display-4"></i><br>
            Configure your pivot table above and click "Generate Pivot Table"
        </p>
    `;
    document.getElementById('pivotActions').style.display = 'none';
    document.getElementById('pivotSummary').style.display = 'none';

    updateCounts();
}

function clearFile() {
    if (sessionId) {
        fetch('/clear_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
    }

    sessionId = null;
    columnsData = [];
    pivotConfig = { filters: {}, rows: [], columns: [], values: [] };

    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('fileInfo').style.display = 'none';
    resetUploadZone();
}

function exportToCSV() {
    const table = document.querySelector('#pivotResult table');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.innerText.replace(/"/g, '""') + '"'));
        csv.push(rowData.join(','));
    });

    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pivot_table.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show position-fixed';
    alertDiv.style.cssText = 'top: 80px; right: 20px; z-index: 9999; max-width: 400px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}