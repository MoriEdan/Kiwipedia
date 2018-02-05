import Templates from "../../wiki-templates/templates.js";
import htmlparser from "./htmlparser.js";
import HTMLHandler from "./htmlhandler.js";

export function prepareNowiki(html) {
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
};