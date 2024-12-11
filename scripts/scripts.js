/* eslint-disable import/no-cycle */
import { events } from '@dropins/tools/event-bus.js';
import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  getMetadata,
  loadScript,
  toCamelCase,
  toClassName,
  readBlockConfig,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  sampleRUM,
} from './aem.js';
import { getProduct, getSkuFromUrl, trackHistory } from './commerce.js';
import initializeDropins from './dropins.js';

const AUDIENCES = {
  mobile: () => window.innerWidth < 600,
  desktop: () => window.innerWidth >= 600,
  // define your custom audiences here as needed
};

/**
 * Gets all the metadata elements that are in the given scope.
 * @param {String} scope The scope/prefix for the metadata
 * @returns an array of HTMLElement nodes that match the given scope
 */
export function getAllMetadata(scope) {
  return [...document.head.querySelectorAll(`meta[property^="${scope}:"],meta[name^="${scope}-"]`)]
    .reduce((res, meta) => {
      const id = toClassName(meta.name
        ? meta.name.substring(scope.length + 1)
        : meta.getAttribute('property').split(':')[1]);
      res[id] = meta.getAttribute('content');
      return res;
    }, {});
}

// Define an execution context
const pluginContext = {
  getAllMetadata,
  getMetadata,
  loadCSS,
  loadScript,
  sampleRUM,
  toCamelCase,
  toClassName,
};

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

function preloadFile(href, as) {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
}

function parseVariants() {
  const regex = /\b(\d+(\.\d{1,2})?)\b\s*([A-Z]{3})\b/;
  return Array.from(document.querySelectorAll('.product-variants > div')).map((variantRow) => {
    const columns = Array.from(variantRow.querySelectorAll(':scope > div')).map((col) => col.textContent.trim());

    const regularPriceCol = columns[4];
    const finalPriceCol = columns[5];
    const regularPriceMatch = regularPriceCol.match(regex);
    const finalPriceMatch = finalPriceCol.match(regex);

    const variant = {
      price: { roles: ['visible'] },
    };
    if (regularPriceMatch) {
      variant.price.regular = {
        amount: {
          currency: regularPriceMatch[3],
          value: parseFloat(regularPriceMatch[1]),
        },
      };
    }
    if (finalPriceMatch) {
      variant.price.final = {
        amount: {
          currency: finalPriceMatch[3],
          value: parseFloat(finalPriceMatch[1]),
        },
      };
    }

    return variant;
  });
}

function computePriceRange(variants) {
  const finalPriceValues = variants.map((v) => v.price.final.amount.value);
  const regularPriceValues = variants.map((v) => v.price.regular.amount.value);

  const minFinal = Math.min(...finalPriceValues);
  const maxFinal = Math.max(...finalPriceValues);
  const minRegular = Math.min(...regularPriceValues);
  const maxRegular = Math.max(...regularPriceValues);
  const { currency } = variants[0].price.final.amount;

  return {
    maximum: {
      final: {
        amount: {
          value: maxFinal,
          currency,
        },
      },
      regular: {
        amount: {
          value: maxRegular,
          currency,
        },
      },
      roles: ['visible'],
    },
    minimum: {
      final: {
        amount: {
          value: minFinal,
          currency,
        },
      },
      regular: {
        amount: {
          value: minRegular,
          currency,
        },
      },
      roles: ['visible'],
    },
  };
}

function parseProductData() {
  const name = document.querySelector('h1')?.textContent?.trim() ?? '';

  const descriptionParagraphs = document.querySelectorAll('main > div > p');
  const description = Array.from(descriptionParagraphs).map((paragraph) => paragraph.innerHTML).join('<br/>');
  const hasVariants = document.querySelector('.product-variants') !== null;

  const attributes = Array.from(document.querySelectorAll('.product-attributes > div')).map((attributeRow) => {
    const cells = attributeRow.querySelectorAll(':scope > div');
    const [attributeName, attributeLabel, attributeValue] = Array.from(cells)
      .map((cell) => cell.textContent.trim());

    // TODO: This should probably be a ul/li list to better split the values
    let value = attributeValue.split(',');
    value = value.length === 1 ? value[0] : value;
    return { name: attributeName, label: attributeLabel, value };
  });

  const images = Array.from(document.querySelectorAll('.product-images img')).map((img) => {
    const src = new URL(img.getAttribute('src'), window.location);
    // Clear query parameters
    src.searchParams.delete('width');
    src.searchParams.delete('format');
    src.searchParams.delete('optimize');
    const alt = img.getAttribute('alt') || '';
    return { url: src.toString(), label: alt, roles: [] };
  });

  const product = {
    __typename: hasVariants ? 'ComplexProductView' : 'SimpleProductView',
    id: '',
    externalId: getMetadata('externalid'),
    sku: getMetadata('sku').toUpperCase(),
    name,
    description,
    shortDescription: '',
    url: getMetadata('og:url'),
    urlKey: getMetadata('urlkey'),
    inStock: getMetadata('instock') === 'true',
    metaTitle: '',
    metaKeyword: '',
    metaDescription: '',
    addToCartAllowed: getMetadata('addtocartallowed') === 'true',
    images,
    attributes,
  };

  if (hasVariants) {
    // Add options
    const options = [];
    Array.from(document.querySelectorAll('.product-options > div')).forEach((optionRow) => {
      const cells = Array.from(optionRow.querySelectorAll(':scope > div')).map((cell) => cell.textContent.trim());
      if (cells[0].toLowerCase() !== 'option') {
        const [id, title, typeName, type, multiple, required] = cells;
        options.push({
          id,
          title,
          typeName,
          type,
          multiple,
          required,
          values: [],
        });
      } else {
        const [, valueId, valueTitle, value, selected, valueInStock, valueType] = cells;
        if (valueId && options.length > 0) {
          options[options.length - 1].values.push({
            id: valueId,
            title: valueTitle,
            value: value ?? valueTitle,
            type: valueType ?? 'TEXT',
            selected,
            inStock: valueInStock,
          });
        }
      }
    });
    product.options = options;
  }

  if (!hasVariants) {
    const priceValue = parseInt(getMetadata('product:price-amount'), 10);
    let price = {};
    if (!Number.isNaN(priceValue)) {
      const currency = getMetadata('product:price-currency') || 'USD';
      price = {
        roles: ['visible'],
        regular: { value: priceValue, currency },
        final: { value: priceValue, currency },
      };
    }
    product.price = price;
  } else {
    // Get all variant prices
    const variants = parseVariants();
    product.priceRange = computePriceRange(variants);
  }

  return product;
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  await initializeDropins();
  decorateTemplateAndTheme();

  // Instrument experimentation plugin
  if (getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadEager: runEager } = await import('../plugins/experimentation/src/index.js');
    await runEager(document, { audiences: AUDIENCES }, pluginContext);
  }

  window.adobeDataLayer = window.adobeDataLayer || [];

  let pageType = 'CMS';

  // TODO: Parse content
  const ogType = getMetadata('og:type');
  const skuFromMetadata = getMetadata('sku');

  if (ogType === 'product' && skuFromMetadata) {
    pageType = 'Product';

    window.getProductPromise = Promise.resolve(parseProductData());
    const main = document.querySelector('main');

    // Remove all other blocks
    main.textContent = '';

    // Create product-details block
    const wrapper = document.createElement('div');
    const block = buildBlock('product-details', '');
    wrapper.append(block);
    main.append(wrapper);

    // Preload product image
    const { images } = await window.getProductPromise;
    if (images.length > 0) {
      const primaryImageUrl = images[0].url;

      const linkTag = document.createRange().createContextualFragment(`<link rel="preload" as="image" href="${primaryImageUrl}" imagesrcset="${primaryImageUrl}?auto=webp&amp;quality=80&amp;crop=false&amp;fit=cover&amp;width=384 768w, ${primaryImageUrl}?auto=webp&amp;quality=80&amp;crop=false&amp;fit=cover&amp;width=512 1024w, ${primaryImageUrl}?auto=webp&amp;quality=80&amp;crop=false&amp;fit=cover&amp;width=683 1366w, ${primaryImageUrl}?auto=webp&amp;quality=80&amp;crop=false&amp;fit=cover&amp;width=960 1920w">`);
      document.head.appendChild(linkTag);
    }

    preloadFile('/placeholders.json', 'fetch');
    preloadFile('/scripts/__dropins__/storefront-pdp/containers/ProductDetails.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/api.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/render.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/chunks/initialize.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/chunks/getRefinedProduct.js', 'script');
  } else if (document.body.querySelector('main .product-details')) {
    pageType = 'Product';
    const sku = getSkuFromUrl();
    window.getProductPromise = getProduct(sku);

    preloadFile('/scripts/__dropins__/storefront-pdp/containers/ProductDetails.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/api.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/render.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/chunks/initialize.js', 'script');
    preloadFile('/scripts/__dropins__/storefront-pdp/chunks/getRefinedProduct.js', 'script');
  } else if (document.body.querySelector('main .product-details-custom')) {
    pageType = 'Product';
    preloadFile('/scripts/__dropins__/tools/preact.js', 'script');
    preloadFile('/scripts/htm.js', 'script');
    preloadFile('/blocks/product-details-custom/ProductDetailsCarousel.js', 'script');
    preloadFile('/blocks/product-details-custom/ProductDetailsSidebar.js', 'script');
    preloadFile('/blocks/product-details-custom/ProductDetailsShimmer.js', 'script');
    preloadFile('/blocks/product-details-custom/Icon.js', 'script');

    const blockConfig = readBlockConfig(document.body.querySelector('main .product-details-custom'));
    const sku = getSkuFromUrl() || blockConfig.sku;
    window.getProductPromise = getProduct(sku);
  } else if (document.body.querySelector('main .product-list-page')) {
    pageType = 'Category';
    preloadFile('/scripts/widgets/search.js', 'script');
  } else if (document.body.querySelector('main .product-list-page-custom')) {
    // TODO Remove this bracket if not using custom PLP
    pageType = 'Category';
    const plpBlock = document.body.querySelector('main .product-list-page-custom');
    const { category, urlpath } = readBlockConfig(plpBlock);

    if (category && urlpath) {
      // eslint-disable-next-line import/no-unresolved, import/no-absolute-path
      const { preloadCategory } = await import('/blocks/product-list-page-custom/product-list-page-custom.js');
      preloadCategory({ id: category, urlPath: urlpath });
    }
  } else if (document.body.querySelector('main .commerce-cart')) {
    pageType = 'Cart';
  } else if (document.body.querySelector('main .commerce-checkout')) {
    pageType = 'Checkout';
  }

  window.adobeDataLayer.push(
    {
      pageContext: {
        pageType,
        pageName: document.title,
        eventType: 'visibilityHidden',
        maxXOffset: 0,
        maxYOffset: 0,
        minXOffset: 0,
        minYOffset: 0,
      },
    },
    {
      shoppingCartContext: {
        totalQuantity: 0,
      },
    },
  );
  window.adobeDataLayer.push((dl) => {
    dl.push({ event: 'page-view', eventInfo: { ...dl.getState() } });
  });

  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  events.emit('eds/lcp', true);

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  await Promise.all([
    loadHeader(doc.querySelector('header')),
    loadFooter(doc.querySelector('footer')),
    loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`),
    loadFonts(),
    import('./acdl/adobe-client-data-layer.min.js'),
  ]);

  if (sessionStorage.getItem('acdl:debug')) {
    import('./acdl/validate.js');
  }

  trackHistory();

  // Implement experimentation preview pill
  if ((getMetadata('experiment')
    || Object.keys(getAllMetadata('campaign')).length
    || Object.keys(getAllMetadata('audience')).length)) {
    // eslint-disable-next-line import/no-relative-packages
    const { loadLazy: runLazy } = await import('../plugins/experimentation/src/index.js');
    await runLazy(document, { audiences: AUDIENCES }, pluginContext);
  }
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

export async function fetchIndex(indexFile, pageSize = 500) {
  const handleIndex = async (offset) => {
    const resp = await fetch(`/${indexFile}.json?limit=${pageSize}&offset=${offset}`);
    const json = await resp.json();

    const newIndex = {
      complete: (json.limit + json.offset) === json.total,
      offset: json.offset + pageSize,
      promise: null,
      data: [...window.index[indexFile].data, ...json.data],
    };

    return newIndex;
  };

  window.index = window.index || {};
  window.index[indexFile] = window.index[indexFile] || {
    data: [],
    offset: 0,
    complete: false,
    promise: null,
  };

  // Return index if already loaded
  if (window.index[indexFile].complete) {
    return window.index[indexFile];
  }

  // Return promise if index is currently loading
  if (window.index[indexFile].promise) {
    return window.index[indexFile].promise;
  }

  window.index[indexFile].promise = handleIndex(window.index[indexFile].offset);
  const newIndex = await (window.index[indexFile].promise);
  window.index[indexFile] = newIndex;

  return newIndex;
}

/**
 * Check if consent was given for a specific topic.
 * @param {*} topic Topic identifier
 * @returns {boolean} True if consent was given
 */
// eslint-disable-next-line no-unused-vars
export function getConsent(topic) {
  console.warn('getConsent not implemented');
  return true;
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
