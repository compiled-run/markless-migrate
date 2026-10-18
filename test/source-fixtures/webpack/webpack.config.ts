import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import path from 'node:path';

export default {
	entry: { app: './src/index.tsx', worker: './src/worker.ts' },
	output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
	plugins: [
		new HtmlWebpackPlugin({ template: './src/index.html', chunks: ['app'] }),
		new HtmlWebpackPlugin({ template: './src/index.html', filename: 'admin/index.html', excludeChunks: ['worker'] }),
		new CopyPlugin({ patterns: [{ from: path.resolve(__dirname, 'src/panel.html'), to: path.resolve(__dirname, 'dist') }, { from: 'src/static/help.html', to: 'docs/' }] }),
	],
};
