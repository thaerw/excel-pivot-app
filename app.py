from flask import Flask, render_template, request, jsonify
import pandas as pd
import os
import uuid
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-this')

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

# Store dataframes in memory (for demo purposes)
dataframes = {}

ALLOWED_EXTENSIONS = {'xlsx', 'xls', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files'}), 400
    
    try:
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Read the file into a DataFrame
        filename = secure_filename(file.filename)
        file_ext = filename.rsplit('.', 1)[1].lower()
        
        if file_ext == 'csv':
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        # Store dataframe in memory
        dataframes[session_id] = df
        
        # Clean up old sessions (keep only last 100)
        if len(dataframes) > 100:
            oldest_keys = list(dataframes.keys())[:-100]
            for key in oldest_keys:
                del dataframes[key]
        
        # Get column information
        columns_info = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            sample_values = df[col].dropna().head(3).tolist()
            
            # Determine column type for UI
            if pd.api.types.is_numeric_dtype(df[col]):
                col_type = 'numeric'
            elif pd.api.types.is_datetime64_any_dtype(df[col]):
                col_type = 'datetime'
            else:
                col_type = 'text'
            
            columns_info.append({
                'name': str(col),
                'dtype': dtype,
                'type': col_type,
                'sample': [str(v) for v in sample_values],
                'null_count': int(df[col].isnull().sum()),
                'unique_count': int(df[col].nunique())
            })
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'filename': filename,
            'row_count': len(df),
            'columns': columns_info
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/preview', methods=['POST'])
def preview_data():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id not in dataframes:
        return jsonify({'error': 'Session expired. Please upload the file again.'}), 400
    
    df = dataframes[session_id]
    
    # Convert to string to handle all data types
    preview_df = df.head(10).fillna('')
    for col in preview_df.columns:
        preview_df[col] = preview_df[col].astype(str)
    
    preview = preview_df.to_dict('records')
    columns = [str(c) for c in df.columns]
    
    return jsonify({
        'columns': columns,
        'data': preview
    })

@app.route('/create_pivot', methods=['POST'])
def create_pivot():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id not in dataframes:
        return jsonify({'error': 'Session expired. Please upload the file again.'}), 400
    
    df = dataframes[session_id]
    
    rows = data.get('rows', [])
    columns = data.get('columns', [])
    values = data.get('values', [])
    filters = data.get('filters', {})
    aggfunc = data.get('aggfunc', 'sum')
    
    try:
        # Apply filters
        filtered_df = df.copy()
        for col, filter_values in filters.items():
            if filter_values:
                filtered_df = filtered_df[filtered_df[col].astype(str).isin([str(v) for v in filter_values])]
        
        # Handle aggregation functions
        agg_map = {
            'sum': 'sum',
            'mean': 'mean',
            'count': 'count',
            'min': 'min',
            'max': 'max',
            'median': 'median',
            'std': 'std'
        }
        aggfunc = agg_map.get(aggfunc, 'sum')
        
        # Create pivot table
        if not values:
            # If no values specified, just count
            if rows:
                pivot = filtered_df.groupby(rows).size().reset_index(name='Count')
                pivot_html = pivot.to_html(classes='table table-striped table-bordered', index=False)
            else:
                return jsonify({'error': 'Please select at least rows or values'}), 400
        else:
            pivot = pd.pivot_table(
                filtered_df,
                values=values if values else None,
                index=rows if rows else None,
                columns=columns if columns else None,
                aggfunc=aggfunc,
                fill_value=0,
                margins=data.get('show_totals', False),
                margins_name='Total'
            )
            
            # Format the pivot table
            if isinstance(pivot, pd.Series):
                pivot = pivot.to_frame()
            
            # Round numeric values
            pivot = pivot.round(2)
            pivot_html = pivot.to_html(classes='table table-striped table-bordered')
        
        # Get summary statistics
        summary = {
            'rows_before_filter': len(df),
            'rows_after_filter': len(filtered_df),
            'pivot_shape': list(pivot.shape) if hasattr(pivot, 'shape') else [0, 0]
        }
        
        return jsonify({
            'success': True,
            'pivot_html': pivot_html,
            'summary': summary
        })
        
    except Exception as e:
        return jsonify({'error': f'Error creating pivot table: {str(e)}'}), 500

@app.route('/get_unique_values', methods=['POST'])
def get_unique_values():
    data = request.json
    session_id = data.get('session_id')
    column = data.get('column')
    
    if session_id not in dataframes:
        return jsonify({'error': 'Session expired'}), 400
    
    df = dataframes[session_id]
    
    if column not in df.columns:
        return jsonify({'error': 'Column not found'}), 400
    
    unique_values = df[column].dropna().unique().tolist()
    # Limit to 100 unique values for performance
    unique_values = sorted([str(v) for v in unique_values[:100]])
    
    return jsonify({
        'column': column,
        'unique_values': unique_values,
        'total_unique': int(df[column].nunique())
    })

@app.route('/clear_session', methods=['POST'])
def clear_session():
    data = request.json
    session_id = data.get('session_id')
    
    if session_id in dataframes:
        del dataframes[session_id]
    
    return jsonify({'success': True})

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'message': 'Excel Pivot App is running!'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)