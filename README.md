# DEMO - DO NOT USE
This project boilerplate is for Edge Delivery Services projects that integrate with Adobe Commerce.

## Documentation
https://experienceleague.adobe.com/developer/commerce/storefront/

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Config Service Setup

### Apply Config
Before running the command, replace the following variables to match your project values:
* `{ORG}` - Name of your organistation in GitHub.
* `{SITE}` - Name of your site in the org. For the first site in your org, it must be equal to the GitHub repository name.
* `{REPO}` - Name of your GitHub repository.
* `{ADMIN_USER_EMAIL}` - Email address of your config admin user.
* `{DOMAIN}` - Public facing domain of your site (e.g. `www.your-shop.com`).
* `{YOUR_TOKEN}` - Your personal access token. You can retrieve one from login via one of the methods from https://admin.hlx.page/login and copy the token from the `auth_token` cookie in the response.

```bash
curl -X POST 'https://admin.hlx.page/config/{org}/sites/{site}.json' \
  -H 'content-type: application/json' \
  -H 'x-auth-token: {YOUR_TOKEN}' \
  --data-binary '@default-config.json'
```

### Apply Index Configuration
```bash
curl -X POST 'https://admin.hlx.page/config/{org}/sites/{site}/content/query.yaml' \
  -H 'content-type: text/yaml' \
  -H 'x-auth-token: {YOUR_TOKEN}' \
  --data-binary '@default-query.yaml'
```

### Apply Sitemap Configuration
```bash
curl -X POST 'https://admin.hlx.page/config/{org}/sites/{site}/content/sitemap.yaml' \
  -H 'content-type: text/yaml' \
  -H 'x-auth-token: {YOUR_TOKEN}' \
  --data-binary '@default-sitemap.yaml'
```

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template and add a mountpoint in the `fstab.yaml`
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Add your Adobe Commerce SaaS configuration in the `configs.xlsx` sheet in your content repository.
1. Install all dependencies using `npm i`.
1. Start AEM Proxy: `npm run up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)

## Changelog

Major changes are described and documented as part of pull requests and tracked via the `changelog` tag. To keep your project up to date, please follow this list:

https://github.com/hlxsites/aem-boilerplate-commerce/issues?q=label%3Achangelog+is%3Aclosed
