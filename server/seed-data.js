// Starting data for a new database: everything that used to be hardcoded in
// index.html. Run `npm run seed` to reset the database to this.
const P2 = (a, b) => ({ '7': a, '10': b });
const today = (d = new Date()) => d.toLocaleDateString('en-CA');

const MENU = [
  { id:'p1',cat:'pizza',name:'Margherita',jain:1,prices:P2(150,280),img:'margherita',desc:'The classic. Tangy tomato sauce under a thick blanket of stretchy mozzarella.'},
  { id:'p2',cat:'pizza',name:'Double Cheese Margherita',jain:1,prices:P2(230,380),img:'doublecheese',desc:'Our Margherita with twice the mozzarella, baked golden. For serious cheese lovers.'},
  { id:'p3',cat:'pizza',name:'Fresh Veggi',jain:1,prices:P2(250,420),desc:'Green capsicum, juicy tomato, black olives and sweet corn on a cheesy base.'},
  { id:'p4',cat:'pizza',name:'Farm Fresh',jain:1,prices:P2(250,420),desc:'Crunchy onion, capsicum, tomato and corn. Light, fresh and colourful.'},
  { id:'p5',cat:'pizza',name:'Veggie Paradise',jain:1,prices:P2(250,420),img:'veggieparadise',desc:'Capsicum, corn, black olives and red paprika. A little of everything good.'},
  { id:'p6',cat:'pizza',name:'Tandoori Paneer',prices:P2(270,450),desc:'Smoky masala-diced paneer with capsicum and red paprika. A desi favourite.'},
  { id:'p7',cat:'pizza',name:'Kadai Paneer',spicy:1,prices:P2(270,450),desc:'Malai paneer in spicy kadai gravy with capsicum, onion and green chilli.'},
  { id:'p8',cat:'pizza',name:'Peri Peri',jain:1,spicy:1,prices:P2(270,450),desc:'Jalapeno, red paprika, red & yellow bell peppers tossed in fiery peri peri masala.'},
  { id:'p9',cat:'pizza',name:'Mexican',prices:P2(270,450),img:'mexican',desc:'Onion, capsicum, tomato and jalapeno with bold Mexican spices.'},
  { id:'p10',cat:'pizza',name:'Paneer Makhani',prices:P2(270,450),desc:'Soft paneer cubes in rich makhani gravy with onion, capsicum and paprika.'},
  { id:'p11',cat:'pizza',name:'Lover Bites',jain:1,prices:P2(300,470),desc:'Onion, tomato, corn, jalapeno, olive and red paprika. Loaded and loveable.'},
  { id:'p12',cat:'pizza',name:'Spicy Fries Pizza',spicy:1,prices:P2(300,470),desc:'Crispy fries on pizza with spicy sauce, onion and red paprika seasoning.'},
  { id:'p13',cat:'pizza',name:'Garlic Paneer',prices:P2(300,470),desc:'Paneer in creamy garlic sauce with green capsicum, onion and olives.'},
  { id:'p14',cat:'pizza',name:'Kathiyavadi',spicy:2,prices:P2(300,470),img:'kathiyavadi',desc:'Our Gujarati special: Kathiyavadi gravy, onion, capsicum and green chilli. Hot!'},
  { id:'p15',cat:'pizza',name:'5 Cheese',jain:1,prices:P2(320,490),img:'fivecheese',desc:'Mozzarella, Monterey Jack, orange, Colby, cheddar and creamy cheese. Five times cheesy.'},
  { id:'p16',cat:'pizza',name:'Cheesy Special',jain:1,prices:P2(320,490),img:'cheesyspecial',desc:'The house special: masala paneer, olives, jalapeno, corn and three bell peppers.'},
  { id:'s1',cat:'pockets',name:'Classic Paneer Pockets',options:['Spicy','No spicy','Less paneer','Less onion','Less capsicum'],price:170,best:1,img:'paneerpockets',desc:'2 crispy baked pockets stuffed with spiced paneer and veggies. No mayo.'},
  { id:'s2',cat:'pockets',name:'Garlic Paneer Pockets',price:170,img:'garlicpockets',desc:'Paneer pockets brushed with garlic butter and herbs. 2 pcs, no mayo.'},
  { id:'s3',cat:'pockets',name:'Jain Paneer Pockets',price:170,jain:1,desc:'Jain-friendly paneer filling, no onion or garlic. 2 pcs, no mayo.'},
  { id:'b1',cat:'bread',name:'Cheesy Garlic Bread',price:160,jain:1,img:'garlicbread',desc:'6 soft sticks with garlic butter, herbs and melted cheese.'},
  { id:'b2',cat:'bread',name:'Indian Masala Bread',price:170,jain:1,best:1,img:'masalabread',desc:'6 sticks topped with onion, tomato, chilli and desi masala. Must try.'},
  { id:'b3',cat:'bread',name:'Stuffed Garlic Bread',price:180,jain:1,desc:'Garlic bread stuffed with cheese, corn and jalapeno.'},
  { id:'b4',cat:'bread',name:'Premium Stuffed Garlic Bread',price:190,best:1,desc:'Extra-loaded stuffing with paneer and cheese. Must try.'},
  { id:'f1',cat:'fries',name:'Salted Fries',price:100,img:'fries',desc:'Golden crispy fries with a pinch of salt.'},
  { id:'f2',cat:'fries',name:'Peri Peri Fries',price:120,spicy:1,img:'fries',desc:'Crispy fries shaken in tangy peri peri masala.'},
  { id:'d1',cat:'dessert',name:'Chocolava',price:80,desc:'Warm chocolate cake with a molten gooey centre.'},
  { id:'x1',cat:'dip',name:'Cheesy Dip',price:30,desc:'Creamy cheese dip. Perfect with fries and garlic bread.'},];

function seedData(now = Date.now()) {
  const date = today(new Date(now));
  return {
    categories: [
      { id: 'pizza', label: 'Pizza', labelGu: 'પિઝ્ઝા' },
      { id: 'pockets', label: 'Paneer Pockets', labelGu: 'પનીર પોકેટ્સ' },
      { id: 'bread', label: 'Garlic Bread', labelGu: 'ગાર્લિક બ્રેડ' },
      { id: 'fries', label: 'French Fries', labelGu: 'ફ્રેન્ચ ફ્રાઈઝ' },
      { id: 'dessert', label: 'Dessert', labelGu: 'ડેઝર્ટ' },
      { id: 'dip', label: 'Dip', labelGu: 'ડીપ' },
    ],
    orderTypes: [
      { id: 'dine', label: 'Dine-in' },
      { id: 'takeaway', label: 'Takeaway' },
      { id: 'delivery', label: 'Delivery' },
      { id: 'zomato', label: 'Zomato' },
    ],
    payModes: [
      { id: 'cash', label: 'Cash', color: '#1f8a4c' },
      { id: 'upi', label: 'GPay / UPI', color: '#1a93a8' },
      { id: 'card', label: 'Card', color: '#6b4fd0' },
      { id: 'bank', label: 'Bank / Cheque', color: '#56727a' },
      { id: 'wallet', label: 'Wallet', color: '#0b3a43' },
      { id: 'zomato', label: 'Zomato', color: '#d23f35' },
      { id: 'due', label: 'Baki (Due)', color: '#b76a00' },
    ],
    config: {
      prepMin: 15,          // minutes from oven to box (default waiting time)
      waitTimes: [15, 20, 30, 40], // waiting times the cashier can pick
      rideMin: 20,          // delivery ride time
      coinRate: 0.05,       // Cheese Coins earned per rupee
      openHour: 12,         // 12 noon
      closeHour: 22,        // 10 pm
      cookNotes: ['Well done / extra crispy', 'Soft bake', 'Less spicy', 'Extra spicy', 'No onion', 'No garlic',
        'Jain (no onion, no garlic)', 'Cut in 8 slices', "Don't cut"],
      orderChips: ['Extra oregano & chilli flakes', 'Pack sauces separately', 'Send extra tissues', "Don't ring the bell",
        'Call on arrival', 'Birthday: add a candle'],
      wheel: [
        { t: '10 coins', k: 'coins', v: 10, c: '#1a93a8' },
        { t: '₹30 off', k: 'flat', v: 30, min: 299, c: '#f2b632' },
        { t: '25 coins', k: 'coins', v: 25, c: '#0d4f5c' },
        { t: 'Free dip', k: 'flat', v: 30, min: 199, c: '#d23f35' },
        { t: 'Try again', k: 'none', c: '#56727a' },
        { t: '50 coins', k: 'coins', v: 50, c: '#6b4fd0' },
        { t: '5% off', k: 'pct', v: 5, c: '#1f8a4c' },
        { t: '15 coins', k: 'coins', v: 15, c: '#b76a00' },
      ],
    },
    state: {
      sizes: [{ id: '7', label: '7"', pcs: 4, color: '#1a93a8' }, { id: '10', label: '10"', pcs: 6, color: '#0f2e36' }],
      outlets: [
        { id: 'o1', code: 'A', name: 'Main Outlet', area: 'Set your address', phone: '7778043066', upi: 'cheesypizza@upi', tables: 10,
          riders: [{ name: 'Jay', phone: '9800000001' }, { name: 'Rahul', phone: '9800000002' }] },
        { id: 'o2', code: 'B', name: 'Branch 2', area: 'Set your address', phone: '7778043066', upi: 'cheesypizza@upi', tables: 10,
          riders: [{ name: 'Vivek', phone: '9800000003' }] },
      ],
      menu: MENU,
      addons: {
        burst: { name: 'Cheese Burst base', prices: P2(70, 90) },
        cheese: { name: 'Extra Cheese', prices: P2(40, 60) },
        veg: { name: 'Extra Veg Topping', prices: P2(20, 30),
          choices: ['Onion', 'Capsicum', 'Tomato', 'Corn', 'Olive', 'Jalapeno', 'Red Paprika', 'Red Capsicum', 'Yellow Capsicum'] },
      },
      offers: [
        { id: 'of1', type: 'day', name: 'Terrific Tuesday', pct: 20, days: [2], scope: 'pizza', min: 0, active: true },
        { id: 'of2', type: 'day', name: 'Friday Fiesta', pct: 15, days: [5], scope: 'all', min: 499, active: true },
        { id: 'of3', type: 'day', name: 'Weekend Feast', pct: 10, days: [6, 0], scope: 'all', min: 599, active: true },
        { id: 'of4', type: 'bogo', name: 'Buy 1 Get 1 Free', size: '7', days: [1, 3, 5], active: true },
        { id: 'of5', type: 'item', name: 'Kathiyavadi Deal', itemId: 'p14', size: '10', kind: 'flat', value: 399, days: [], active: true },
        { id: 'of6', type: 'item', name: '5 Cheese Craving', itemId: 'p15', size: 'any', kind: 'pct', value: 20, days: [], active: true },
        { id: 'of7', type: 'code', name: 'Welcome Treat', code: 'CHEESY50', kind: 'flat', value: 50, min: 399, days: [], active: true, once: true },
        { id: 'of8', type: 'code', name: 'Party Order', code: 'PARTY10', kind: 'pct', value: 10, cap: 150, min: 999, days: [], active: true },
        { id: 'of9', type: 'code', name: 'First Order Treat', code: 'WELCOME100', kind: 'flat', value: 100, min: 299, firstOnly: true, days: [], active: true },
      ],
      // Extra menus shown when a pizza is added. `from` names the add-on whose
      // prices an older database copies (see Store.addExtraMenus).
      extras: [
        { id: 'xveg', name: 'Extra veg topping', active: true, pizzas: 'all',
          items: ['Onion', 'Capsicum', 'Tomato', 'Corn', 'Olive', 'Jalapeno', 'Red Paprika', 'Red Capsicum', 'Yellow Capsicum']
            .map(name => ({ name, prices: P2(20, 30), from: 'veg' })) },
        { id: 'xtop', name: 'Toppings', active: true, pizzas: 'all',
          items: [{ name: 'Extra Cheese', prices: P2(40, 60), from: 'cheese' }] },
      ],
      combos: [
        { id: 'c1', name: 'Solo Meal', desc: 'Any 7" pizza up to ₹270 + Salted Fries + Cheesy Dip', price: 299, pizzas: 1, size: '7', tier: 270, extras: ['f1', 'x1'], active: true },
        { id: 'c2', name: 'Duo Date', desc: 'Any two 7" pizzas + Cheesy Garlic Bread + Chocolava', price: 649, pizzas: 2, size: '7', tier: 320, extras: ['b1', 'd1'], active: true },
        { id: 'c3', name: 'Family Feast', desc: 'Any two 10" pizzas up to ₹450 + Indian Masala Bread + Peri Peri Fries', price: 999, pizzas: 2, size: '10', tier: 450, extras: ['b2', 'f2'], active: true },
      ],
      // Demo PINs: Owner 1234, Cashier 1111, Kitchen 2222 (stored hashed)
      users: [
        { id: 'u1', name: 'Owner', role: 'owner', _newPin: '1234' },
        { id: 'u2', name: 'Cashier', role: 'cashier', _newPin: '1111' },
        { id: 'u3', name: 'Kitchen', role: 'kitchen', _newPin: '2222' },
      ],
      // Demo customer account: 9825011111, PIN 1234, birthday today
      customers: {
        '9825011111': { phone: '9825011111', name: 'Ravi Patel', due: 0, coins: 0, wallet: 250, myCodes: [], ref: 'CP11111',
          joined: now, bday: '1995-' + date.slice(5), addr: '12, Shanti Nagar', _newPin: '1234',
          tx: [{ ts: now - 864e5, kind: 'wallet', amt: 250, note: 'Added money via UPI' }] },
      },
    },
  };
}

module.exports = { seedData };
