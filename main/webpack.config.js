const path = require("path");

const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
	context: path.resolve(__dirname, "./src"),
	entry: {
		main: ["babel-polyfill", "./main.js"]
	},
	output: {
		path: path.resolve(__dirname, "./dist"),
		publicPath: "./",
		filename: "[name].js"
	},
	module: {
		rules: [
			{
				test: /\.vue$/,
				loader: "vue-loader",
				options: {
					loaders: {
						scss: "vue-style-loader!css-loader!sass-loader",
						sass: "vue-style-loader!css-loader!sass-loader?indentedSyntax",
					}
				}
			},
			{
				test: /\.css$/,
				loader: "style-loader!css-loader"
			},
			{
				test: /\.s[ac]ss$/,
				loader: "style-loader!css-loader!sass-loader?indentedSyntax"
			},
			{
				test: /\.js$/,
				use: [
					{
						loader: "babel-loader",
						options: {
							presets: ["env"],
							plugins: [
								[
									"babel-plugin-transform-builtin-extend", {
										globals: ["Error", "Array"]
									}
								],
								"transform-class-properties"
							]
						}
					}
				],
				exclude: /node_modules/
			},
			{
				test: /\.js$/,
				use: [
					{
						loader: "babel-loader",
						options: {
							presets: ["env", "flow"],
							plugins: [
								"transform-class-properties"
							]
						}
					}
				],
				include: /node_modules.*katex/
			},
			{
				test: /\.(gif|jpe?g|png)$/,
				loader: "file-loader"
			},
			{
				test: /\.svg$/,
				loader: "url-loader",
				options: {
					mimetype: "image/svg+xml"
				}
			},
			{
				test: /\.(ttf|otf|eot|woff2?)$/,
				loader: "file-loader?name=fonts/[name].[ext]"
			}
		]
	},
	plugins: [
		new HtmlWebpackPlugin({
			title: "Kiwipedia",
			template: "./index.html",
			seo: {
				keywords: "wikipedia",
				description: "Wikipedia for ZeroNet with auto-import"
			}
		}),
		new CopyWebpackPlugin([
			{
				from: "./dbschema.json",
				to: "./dbschema.json"
			}
		]),
		new CopyWebpackPlugin([
			{
				from: "./content.json",
				to: "./content.json"
			}
		]),
		new CopyWebpackPlugin([
			{
				from: "./data",
				to: "./data"
			}
		]),
		new webpack.optimize.CommonsChunkPlugin({
			name: "vendor",
			minChunks: module => {
				return module.context.includes("node_modules");
			}
		}),
		new webpack.optimize.CommonsChunkPlugin({
			name: "core-js",
			minChunks: module => {
				// Thank you CommonsChunkPlugin syntax: we include
				// instaview both here and in `instaview` chunk
				// because CommonsChunkPlugin extracts data only
				// from previous CommonsChunkPlugin call
				return module.context.includes("core-js") || module.context.includes("instaview") || module.context.includes("katex");
			}
		}),
		new webpack.optimize.CommonsChunkPlugin({
			name: "instaview",
			minChunks: module => {
				return module.context.includes("instaview") || module.context.includes("katex");
			}
		}),
		new webpack.optimize.CommonsChunkPlugin({
			name: "katex1",
			minChunks: module => {
				return module.context.includes("katex");
			}
		}),
		new webpack.optimize.CommonsChunkPlugin({
			name: "katex2",
			minChunks: module => {
				// Move half of KaTeX to separate bundle
				const name = module.resource.split(/\\|\//).slice(-1)[0];
				return [
					"buildHTML.js",
					"buildCommon.js",
					"delimiter.js",
					"domTree.js",
					"array.js",
					"macros.js",
					"Options.js",
					"Lexer.js",
					"functions.js",
					"genfrac.js",
					"stretchy.js",
					"sqrt.js",
					"buildMathML.js",
					"unicodeSymbols.js",
					"Parser.js",
					"symbols.js",
					"fontMetrics.js",
					"fontMetricsData.js",
					"delimsizing.js",
					"op.js"
				].indexOf(name) > -1;
			}
		}),
		new webpack.optimize.CommonsChunkPlugin({
			name: "katex3",
			minChunks: module => {
				// Move half of KaTeX to separate bundle
				const name = module.resource.split(/\\|\//).slice(-1)[0];
				return [
					"Parser.js",
					"symbols.js",
					"fontMetrics.js",
					"fontMetricsData.js",
					"delimsizing.js",
					"op.js"
				].indexOf(name) > -1;
			}
		})
	]
};