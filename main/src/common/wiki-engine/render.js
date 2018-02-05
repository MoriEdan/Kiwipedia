import InstaView from "instaview";
import Templates from "../../wiki-templates/templates.js";
import {getHubList} from "../../common/hub-manager.js";
import htmlparser from "./htmlparser.js";
import HTMLHandler from "./htmlhandler.js";
import * as util from "../../common/util.js";
import {wikiTextToHTML} from "./wikitext.js";
import {parseTemplateParams} from "./parser.js";

export default {
	name: "markdown-article",
	props: ["text", "slug", "article", "imported", "title"],
	data() {
		return {
			text: "",
			slug: "",
			article: "",
			imported: "",
			rendered: "",

			id: ""
		};
	},
	async mounted() {
		this.id = Math.random().toString(36).substr(2);

		const res = await this.render(this.text);
		this.rendered = res.html;

		let renderData = res.renderData;
		Object.freeze(renderData);

		this.$nextTick(() => {
			const rootNode = document.getElementById(this.id);
			if(!rootNode) {
				return;
			}

			const secondaryRenderer = async (template, params) => {
				if(Templates[template].afterRender) {
					return await this.renderTemplate(
						"ambox",
						{
							type: "serious",
							text: "'''AfterRender error'''",
							"text-small": "Template with afterRender cannot be invoked in afterRender handler"
						}
					);
				}

				return await this.renderTemplate(template, params, renderData);
			};

			Object.keys(Templates)
				.filter(templateName => /^<.*>$/.test(templateName))
				.map(templateName => templateName.match(/^<(.*)>$/)[1])
				.filter(tagName => Templates[`<${tagName}>`].afterRender)
				.forEach(tagName => {
					const toRender = Array.from(rootNode.querySelectorAll(`rendered-${tagName}`));
					toRender.forEach(async node => {
						let params = {_: util.base64decode(node.innerHTML)};

						Array.from(node.attributes)
							.forEach(attr => params[attr.name] = attr.value);

						const afterRender = await Templates[`<${tagName}>`].afterRender(params, secondaryRenderer);

						const newNode = document.createElement("div");
						newNode.innerHTML = afterRender;

						if(newNode.children.length == 0) {
							node.parentNode.removeChild(node);
						} else if(newNode.children.length == 1) {
							node.parentNode.replaceChild(newNode.children[0], node);
						} else {
							node.innerHTML = await wikiTextToHTML(
								await this.renderTemplate(
									"ambox",
									{
										type: "serious",
										text: "'''AfterRender error'''",
										"text-small": `AfterRender handler must return one node only, ${newNode.children.length} were returned.`
									}
								),
								this.slug
							);
						}
					});
				});
		});
	},
	methods: {
		async render(text) {
			await this.init();

			const renderData = this.initTemplates();

			text = this.prepareNowiki(text);

			const {replaced, renderingTemplates} = this.replaceTemplates(text);
			const rendered = await this.renderTemplates(replaced, renderingTemplates, renderData);

			const html = await wikiTextToHTML(rendered, this.slug);
			return {html, renderData};
		},

		async init() {
			let hubs = await getHubList();
			hubs = hubs.map(hub => hub.slug);
			hubs = hubs.join("|");

			InstaView.conf.wiki = {
				lang: "language",
				interwiki: hubs,
				default_thumb_width: 180
			};
			InstaView.conf.paths = {
				base_href: "./",
				articles: `ARTICLENAMEGOESHERE`,
				math: "/math/", // TODO
				images: "",
				images_fallback: "", // TODO
				magnify_icon: "" // TODO
			};
		},

		initTemplates() {
			let renderData = {};
			for(let template of Object.values(Templates)) {
				if(template.init) {
					template.init.call(renderData);
				}
			}
			return renderData;
		},

		replaceTemplates(text) {
			let lastTemplateId = 0;

			const templateConstant = `MY_AWESOME_TEMPLATE_NUMBER_{{id}}_GOES_HERE_PLEASE_DONT_USE_THIS_CONSTANT_ANYWHERE_IN_ARTICLE`;

			const renderingTemplates = {};

			// Remove <!-- --> comments
			text = text.replace(/<!--[\s\S]*?-->/g, "");

			// First, replace {{templates}} with constants
			let replaced = text, oldReplaced;
			do {
				oldReplaced = replaced;
				replaced = this.replace(replaced, template => {
					const id = lastTemplateId++;
					renderingTemplates[id] = template;
					return templateConstant.replace("{{id}}", id);
				});
			} while(oldReplaced != replaced);

			return {renderingTemplates, replaced};
		},
		replace(text, callback) {
			// First tokenize
			let tokens = [];
			let state = "";
			text.split("").forEach(char => {
				if(char == "{" && state == "{") {
					state = "";
					tokens.pop();
					tokens.push("\x00");
				} else if(char == "{" && state != "{") {
					state = "{";
					tokens.push(state);
				} else if(char == "}" && state == "}") {
					state = "";
					tokens.pop();
					tokens.push("\x01");
				} else if(char == "}" && state != "}") {
					state = "}";
					tokens.push(state);
				} else {
					state = "";
					tokens.push(char);
				}
			});

			tokens = tokens.join("");

			return tokens.replace(/\x00([^\x00\x01]*?)\x01/g, (all, template) => {
				return callback(template);
			}).replace(/\x00/g, "{{").replace(/\x01/g, "}}");
		},

		async renderTemplates(text, renderingTemplates, renderData) {
			let rendered = this.renderCurlyTemplates(text, renderingTemplates, renderData);
			rendered = await this.convertTagTemplates(rendered, renderData);
			return rendered;
		},
		renderCurlyTemplates(text, renderingTemplates, renderData) {
			const templateRegexp = /MY_AWESOME_TEMPLATE_NUMBER_(.+?)_GOES_HERE_PLEASE_DONT_USE_THIS_CONSTANT_ANYWHERE_IN_ARTICLE/g;

			const rendered = text.replace(templateRegexp, (all, id) => {
				const template = renderingTemplates[id];

				let {name, params} = this.parseTemplate(template);

				name = name[0].toLowerCase() + name.substr(1);
				if(!Templates[name]) {
					return `
						<kiwipedia-template is="unexisting-template">
							<kiwipedia-param name="name">${name}</kiwipedia-param>
						</kiwipedia-template>
					`.replace(/[\t\n]/g, "");
				}

				for(let paramName of Object.keys(params)) {
					let paramValue = params[paramName];
					paramValue = this.renderCurlyTemplates(paramValue, renderingTemplates, renderData);
					params[paramName] = paramValue;
				}

				return (
					`<kiwipedia-template is="${name}">` +
						Object.keys(params).map(paramName => {
							let paramValue = params[paramName];
							return `<kiwipedia-param name="${paramName}">${paramValue}</kiwipedia-param>`;
						}).join("") +
					`</kiwipedia-template>`
				);
			});

			return rendered;
		},

		parseTemplate(template) {
			if(template[0] == "#") {
				let name = template.substr(0, template.indexOf(":"));
				let params = template.substr(template.indexOf(":") + 1);

				return {
					name: name.trimLeft(),
					params: parseTemplateParams(params, false)
				};
			}

			let match = template.match(/^([^#<>\[\]\|\{\}]+?)\|([\s\S]*)$/);
			if(match) {
				return {
					name: match[1].trim(),
					params: parseTemplateParams(match[2])
				};
			}

			match = template.match(/^([^#<>\[\]\|\{\}]+?)$/);
			if(match) {
				return {
					name: match[1].trim(),
					params: {}
				};
			}

			return {
				name: "invalid-template",
				params: {
					code: template
				}
			};
		},

		async renderTemplate(template, params, renderData) {
			const renderer = async (template, params) => {
				return await this.renderTemplate(template, params, renderData);
			};

			template = template[0].toLowerCase() + template.substr(1);
			if(!Templates[template]) {
				return await this.renderTemplate("unexisting-template", {
					name: template
				}, renderData);
			}

			const context = {
				slug: this.slug,
				article: this.article,
				imported: this.imported,
				title: this.title
			};

			let rendered = (await Templates[template].render.call(renderData, params, renderer, context))
				.trim()
				.replace(/\n/g, "");

			if(/^<.*>$/.test(template) && Templates[template].afterRender) {
				let attribs = (
					Object.keys(params)
						.filter(name => name != "_")
						.map(name => {
							return {
								name: name,
								value: params[name]
									.replace(/&/g, "&amp;")
									.replace(/"/g, "&quot;")
							};
						})
						.map(({name, value}) => `${name}="${value}"`)
						.join(" ")
				)

				const tagName = template.match(/^<(.*)>$/)[1];
				rendered = `<rendered-${tagName} ${attribs}>${util.base64encode(rendered)}</rendered-${tagName}>`;
			}

			return rendered;
		},

		async convertTagTemplates(html, renderData) {
			const handler = new HTMLHandler(`<div>\n${html}\n</div>`);
			const parser = new htmlparser.Parser(handler);
			parser.parseComplete(`<div>\n${html}\n</div>`);

			const renderTagTemplate = async elem => {
				const template = elem.attribs.is;

				const params = {};
				const children = (elem.children || [])
					.filter(child => child.type == "tag" && child.name == "kiwipedia-param");

				for(const child of children) {
					const paramName = child.attribs.name;
					const paramValue = (await Promise.all((child.children || []).map(convert))).join("");

					params[paramName] = paramValue;
				}

				return await this.renderTemplate(template, params, renderData);
			};

			const renderNowiki = async elem => {
				const params = {};
				const children = (elem.children || [])
					.filter(child => child.type == "tag" && child.name == "kiwipedia-param");

				for(const child of children) {
					const paramName = child.attribs.name;
					const paramValue = (await Promise.all((child.children || []).map(convert))).join("");

					params[paramName] = paramValue;
				}

				let inside = (elem.children || [])
					.find(child => child.type == "tag" && child.name == "kiwipedia-inside");
				if(inside) {
					inside = util.base64decode(inside.attribs.value);
				} else {
					inside = "";
				}

				params._ = inside;

				const template = `<${elem.attribs.is}>`;

				return await this.renderTemplate(template, params, renderData);
			};

			const convert = async elem => {
				if(elem.type == "text") {
					return elem.raw;
				} else if(elem.type == "tag") {
					if(elem.name == "kiwipedia-template") {
						return await renderTagTemplate(elem);
					} else if(elem.name == "kiwipedia-nowiki") {
						return await renderNowiki(elem);
					}

					let renderedInside = (await Promise.all((elem.children || []).map(convert))).join("");

					let template = `<${elem.name}>`;
					if(Templates[template]) {
						let params = {_: renderedInside};
						Object.assign(params, elem.attribs || {});
						return await this.renderTemplate(template, params, renderData);
					} else {
						return `<${elem.raw}>${renderedInside}</${elem.name}>`;
					}
				}
			};
			return await convert(handler.dom[0]);
		},

		prepareNowiki(html) {
			const handler = new HTMLHandler(`<div>\n${html}\n</div>`);
			const parser = new htmlparser.Parser(handler);
			parser.parseComplete(`<div>\n${html}\n</div>`);

			const convertNowiki = elem => {
				if(elem.type == "text") {
					return elem.raw;
				} else if(elem.type == "tag") {
					let renderedInside = (elem.children || []).map(convertNowiki).join("");

					return `<${elem.raw}>${renderedInside}</${elem.name}>`;
				}
			};

			const getInside = elem => {
				const first = handler.tokens[elem.openTokenId];
				const last = handler.tokens[elem.closeTokenId];

				return `<div>\n${html}\n</div>`.substring(first.to + 1, last.from - 1);
			};

			const convert = elem => {
				if(elem.type == "text") {
					return elem.raw;
				} else if(elem.type == "tag") {
					if(Templates[`<${elem.name}>`] && Templates[`<${elem.name}>`].nowiki) {
						const renderedInside = getInside(elem);

						return `<kiwipedia-nowiki is="${elem.name}">` +
							Object.keys(elem.attribs || {}).map(key => {
								const value = elem.attribs[key];
								return `<kiwipedia-param name="${key}">${value}</kiwipedia-param>`;
							}).join("") +
							`<kiwipedia-inside value="${util.base64encode(renderedInside)}" />` +
						`</kiwipedia-nowiki>`;
					}

					let renderedInside = (elem.children || []).map(convert).join("");

					return `<${elem.raw}>${renderedInside}</${elem.name}>`;
				}
			};
			return convert(handler.dom[0]);
		},

		clicked(e) {
			let parent = e.target;
			while(parent) {
				if(typeof parent.tagName == "string" && parent.tagName.toLowerCase() == "a") {
					const href = parent.getAttribute("href") || "";
					if(href[0] == "?") {
						this.$router.navigate(href.replace(/^\?\/?/, ""));
					}
					e.preventDefault();
					break;
				}
				parent = parent.parentNode;
			}
		}
	}
};