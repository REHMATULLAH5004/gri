# Griffins-Medicals-Limited
Wholesale For codes for GoGriffins.com

## Folder layout (same style as the ERP project)

```
www/
  index.html                      entry point - sends visitors (and the Capacitor app) to the shop home page
  assets/
    js/
      supabase-config.js          shop database + ERP (products/stock) connection - shared by every page
      back-button.js              Android back-button / navigation history - shared by every page
  pages/
    home/       index.html  index.css  index.js     shop home page (index.js is also shared by the other shop pages)
    products/   index.html  index.css  index.js     product list
    product-detail/  index.html  index.css  index.js   single product page
    cart/       index.html  index.css  index.js     cart / checkout
    admin/      index.html  index.css  index.js     shop admin
```

Every page keeps its own HTML, CSS and JS in its own folder.
Pages link to each other like `../cart/index.html`; shared files live in `assets/`.
