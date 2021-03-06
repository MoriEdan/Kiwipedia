<template>
	<div>
		<div v-if="status == 'error'">
			<h1>Error</h1>
			<p>{{error}}</p>
		</div>
		<div v-else>
			<hub-header :hub="hub" v-if="status == 'hubLoaded'" />

			<h1>Import an article</h1>

			<p>
				<a :href="`?/new-article/${slug}`" @click.prevent="$router.navigate(`new-article/${slug}`)">or create it from scratch.</a>
			</p>

			<p v-if="isFirst">
				This is the first article, so it will be marked as <b>home</b>.
			</p>

			<setting
				type="text"
				name="Title"
				description="Leave it empty to use title from article source"
				ref="title"
				v-model="title"
			/>

			<s-button value="Import from Wikipedia" @click="importWikipedia" />
			<s-button value="Import from ZeroWiki" @click="importZeroWiki" />

			<p>Or</p>

			<setting
				type="text"
				name="Source"
				description="Use http[s]://{language}.wikipedia.org/wiki/{article} for Wikipedia.org, zerowiki://{article} for original ZeroWiki and zerowiki://{address}/{article} for ZeroWiki clones"
				ref="source"
				v-model="source"
			/>

			<s-button value="Import" @click="importArticle" />
		</div>
	</div>
</template>

<script type="text/javascript">
	import Hub, {NotEnoughError, TooMuchError, toSlug} from "../../common/hub.js";
	import importer from "../../common/importer.js";

	export default {
		name: "import-article",
		data() {
			return {
				slug: "",
				status: "",
				error: "",

				title: "",
				source: "",

				isFirst: false,

				hub: null
			};
		},
		async mounted() {
			const language = this.$router.currentParams.language;
			const subgroup = this.$router.currentParams.subgroup || "";
			this.slug = language + (subgroup && `/${subgroup}`);

			this.hub = new Hub(this.slug);
			try {
				await this.hub.init();
			} catch(e) {
				this.header = "Error";
				this.error = e.message;
				this.status = "error";
				return;
			}

			const index = await this.hub.getIndex();
			if(index.length == 0) {
				this.isFirst = true;
				this.$refs.title.disabled = true;
				this.title = "Home";
			}

			this.status = "hubLoaded";
		},
		methods: {
			async importArticle() {
				let content, title;
				try {
					const res = await importer(this.source);
					content = res.content;
					title = res.title;
				} catch(e) {
					this.$zeroPage.error(e.message);
					return;
				}

				title = this.title || title;

				if(!title) {
					this.$zeroPage.error("Please fill title");
					return;
				}

				const slug = await this.hub.publishArticle(title, content, this.source);

				this.$router.navigate(`wiki/${this.slug}/${slug}`);
			},
			async importWikipedia() {
				if(!this.title) {
					this.$zeroPage.error("Please fill title");
					return;
				}

				const language = this.slug.split("/")[0];
				this.source = `https://${language}.wikipedia.org/wiki/${this.title}`;

				await this.importArticle();
			},
			async importZeroWiki() {
				if(!this.title) {
					this.$zeroPage.error("Please fill title");
					return;
				}

				this.source = `zerowiki://${toSlug(this.title)}`;

				await this.importArticle();
			}
		}
	};
</script>