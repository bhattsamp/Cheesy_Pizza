# Cheesy Pizza

Customer ordering site and outlet POS for Cheesy Pizza, backed by MongoDB.

- **Customer site**: menu, combos, coupons, cart, order tracking, accounts, wallet and rewards
- **Outlet POS**: new orders, kitchen display, counter lanes, order history, reports, outlet settings

## Run

Ne## Run

Needs Node.js 20 or newer and a MongoDB database (a local `mongod`, or a free MongoDB Atlas cluster).

```sh
npm install
cp .env.example .env      # then set MONGODB_URI to your database
npm start                 # http://localhost:3000
```

On first start the database is filled with the starting menu, outlets, offers, combos
and staff, plus a few days of demo orders. Every device that opens the site reads and
writes the same database, so the kitchen screen, counter and customer tracking stay in
step across phones and tablets.

```sh
npm run seed               # reset the database to the starting data (with demo orders)
npm run seed -- --empty    # reset without demo orders, for real use
npm test                   # API tests (wipes the database in MONGODB_TEST_URI,
                           # default mongodb://127.0.0.1:27017/cheesy_pizza_test)
```

Settings (in `.env`): `MONGODB_URI` (default `mongodb://localhost:27017/ChessyPizza`) and `PORT` (default 3000).

Demo logins: staff PINs Owner 1234, Cashier 1111, Kitchen 2222; customer 9825011111 with PIN 1234.

## Mobile app

`mobile/` holds an Android and iOS app built with [Capacitor](https://capacitorjs.com). Android
builds two apps from it: **Cheesy Pizza** (`com.cheesypizza.app`, the customer site only) and
**Cheesy Pizza Admin** (`com.cheesypizza.admin`, the outlet POS only, with its own icon). Each works
in one of two ways, chosen when it is built:

- **Offline (default, no server needed):** the whole site runs inside the app, starting from the
  same menu and demo data as `npm run seed`. Orders, menu edits and accounts are saved on that
  phone only, so other phones and the kitchen screen will not see them.
- **Online:** set `CHEESY_SERVER_URL` to the server's address and the app opens that server full
  screen, sharing live data with every other device. The phone must be able to reach it (a hosted
  address, or the shop computer's LAN address like `http://192.168.1.20:3000` on the same Wi-Fi);
  `localhost` will not work.

**Get an APK without installing anything:** in GitHub open Actions > Android APK > Run workflow.
Leave `server_url` blank for the offline app, or paste a server address (a repository variable
`CHEESY_SERVER_URL` under Settings > Secrets and variables > Actions > Variables sets it for every
build). When it finishes, open
https://github.com/bhattsamp/Cheesy_Pizza/releases/download/android-latest/cheesy-pizza.apk (or
`cheesy-pizza-admin.apk` for the Admin app) on the phone (every build from `main` updates it too) and install it, allowing installs from unknown
sources when asked. Each build installs over the previous one.

**Build locally** (Node 22+, Android Studio or Xcode):

```sh
cd mobile
npm install
npm run sync              # offline app; or CHEESY_SERVER_URL=https://... npm run sync
npx cap open android      # or: npx cap open ios (on a Mac)
```

**Shared claude.ai artifact (no server):** `node mobile/scripts/build-shared.js` builds
`mobile/artifact/` for publishing as a claude.ai artifact with the `db` and `user` capabilities.
Each device picks the customer app or the owner app on first open, and both read and write the
artifact's shared database, so customer orders ring on the owner's POS live. Everyone using it
must be signed in to claude.ai and need edit access to place orders.

## What is stored where

| Collection | Holds |
| --- | --- |
| `menu_items` | Menu, with per-size pizza prices |
| `addons`, `sizes` | Add-ons with per-size prices, pizza sizes |
| `categories`, `order_types`, `payment_modes` | Menu sections (with Gujarati names), order types, payment modes and their chart colours |
| `offers`, `combos` | Day offers, BOGO, item deals, coupon codes, combos |
| `outlets` | Outlets, their delivery riders and the new-order ringtone the owner picks |
| `staff` | POS staff and roles (PINs stored as scrypt hashes) |
| `customers` | Accounts, wallet and coin history, personal coupons |
| `orders` | Orders with their lines, payment and status times |
| `counters` | Per-outlet daily bill numbers and the change counter |
| `extra_menus` | Extra menus shown when adding a pizza (Extra veg topping, Toppings, ...), each with items and a price per size |
| `images` | Menu photos uploaded from the Menu screen (served at `/api/images/:id`) |
| `settings` | Prep and ride times, coin rate, opening hours, cooking notes, order note chips, prize wheel |

Models are in `server/models.js` and the starting data in `server/seed-data.js`.
This device only keeps its chosen outlet, site mode and who is signed in in local storage.

Method | Path | |
| --- | --- | --- |
| GET | `/api/state` | Everything the app needs, in one response |
| GET | `/api/version` | Change counter, polled every 5 s for updates from other devices |
| POST | `/api/sync` | Save changes: `{ upsert: { orders: [...] }, delete: { menu: ["p1"] } }` |
| POST | `/api/auth/staff`, `/api/auth/customer` | Check a PIN |
| GET | `/api/menu`, `/api/offers`, `/api/combos`, `/api/outlets`, `/api/sizes`, `/api/addons`, `/api/config` | Read-only lists |
| GET | `/api/orders?outlet=&date=&status=&phone=` | Orders, filtered |
| GET | `/api/customers/:phone` | One customer |
| POST | `/api/images` | Upload a menu photo: `{ data: 'data:image/jpeg;base64,...' }` returns `{ url }` |
| POST | `/api/reset` | Reset to demo data |

The API has no login of its own yet: anyone who can reach the server can read and change
data, so run it on the shop's own network until API auth is added.
