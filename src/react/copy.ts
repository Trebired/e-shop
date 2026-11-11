type StorefrontCopy = { accountErrors: Record<string, string>; paymentMethods: Record<string, string>; statuses: Record<string, string> } &Record<
"accountName" | "add" | "added" | "address" | "cart" | "checkout" | "city" | "continue" | "email" | "empty" | "iban" | "name" | "note"
|"orderPlaced" | "outOfStock" | "pay" | "payOnline" | "payment" | "paymentFailed"
|"paymentWaiting" | "phone" | "placeOrder" | "postalCode" | "quantity" | "remove" | "shipping" | "status"
|"street" | "subtotal" | "total" | "variant" | "variableSymbol" | "dueDate" | "free" | "pickupPoint" | "choosePickupPoint" | "track"
|"invoice" | "creditNote" | "error" | "login" | "register" | "logout" | "password" | "newPassword" | "forgot" | "sendReset"
|"resetSent" | "setPassword" | "resetDone" | "signedInAs" | "myOrders" | "noOrders" | "allProducts" | "products" | "noProducts" | "more"
|"productMissing" | "yourOrder" | "account" | "refundClaim",
string
>;

const COPY: Record<string, StorefrontCopy> = {
  cs: {
    choosePickupPoint: "Vybrat výdejní místo",
    statuses: {
      cancelled: "Zrušená",
      delivered: "Doručená",
      paid: "Zaplacená",
      pending_payment: "Čeká na platbu",
      processing: "Vyřizuje se",
      refunded: "Peníze vráceny",
      shipped: "Odeslaná",
    },
    track: "Sledovat zásilku",
    invoice: "Faktura",
    accountErrors: {
      "eshop-email-invalid": "Zadejte platný e-mail.",
      "eshop-email-taken": "Účet s tímto e-mailem už existuje.",
      "eshop-login-invalid": "E-mail nebo heslo nesouhlasí.",
      "eshop-login-throttled": "Příliš mnoho pokusů. Zkuste to za chvíli.",
      "eshop-name-required": "Zadejte jméno.",
      "eshop-password-weak": "Heslo musí mít aspoň 10 znaků.",
      "eshop-reset-invalid": "Odkaz pro obnovu hesla neplatí. Požádejte o nový.",
    },
    account: "Účet",
    allProducts: "Všechny produkty",
    more: "Zobrazit další",
    noProducts: "Zatím žádné produkty.",
    productMissing: "Tento produkt není v prodeji.",
    products: "Produkty",
    refundClaim: "Převzít vrácenou platbu",
    yourOrder: "Vaše objednávka",
    forgot: "Zapomenuté heslo",
    login: "Přihlásit se",
    logout: "Odhlásit se",
    myOrders: "Moje objednávky",
    newPassword: "Nové heslo",
    noOrders: "Zatím žádné objednávky.",
    password: "Heslo",
    register: "Vytvořit účet",
    resetDone: "Heslo je nastavené. Můžete se přihlásit.",
    resetSent: "Pokud účet existuje, poslali jsme na e-mail odkaz pro nové heslo.",
    sendReset: "Poslat odkaz",
    setPassword: "Nastavit heslo",
    signedInAs: "Přihlášeni jako {{name}}",
    creditNote: "Opravný doklad",
    paymentMethods: {
      bank_transfer: "Bankovní převod",
      btcpay: "Bitcoin",
      comgate: "Platba kartou (Comgate)",
      gopay: "Platba kartou (GoPay)",
      stripe: "Platba kartou",
    },
    accountName: "Majitel účtu", add: "Přidat do košíku", added: "Přidáno do košíku", address: "Fakturační adresa", cart: "Košík",
    checkout: "Pokladna", city: "Město", continue: "Pokračovat v nákupu", dueDate: "Splatnost", email: "E-mail", empty: "Košík je prázdný.",
    error: "Akce se nepovedla.", free: "Zdarma", iban: "Účet (IBAN)", name: "Jméno a příjmení", note: "Poznámka", orderPlaced: "Objednávka " +
      "{{number}} je přijatá.",
    outOfStock: "Vyprodáno", pay: "Zaplaťte převodem nebo naskenujte QR kód v bankovní aplikaci.", payment: "Platba", phone: "Telefon",
    payOnline: "Zaplatit online", paymentFailed: "Platba neproběhla. Zkuste to prosím znovu.", paymentWaiting: "Čekáme na potvrzení platby.",
    pickupPoint: "Výdejní místo", placeOrder: "Objednat s povinností platby", postalCode: "PSČ", quantity: "Množství", remove: "Odebrat",
    shipping: "Doprava", status: "Stav", street: "Ulice a číslo", subtotal: "Zboží", total: "Celkem",
    variableSymbol: "Variabilní symbol", variant: "Varianta",
  },
  en: {
    choosePickupPoint: "Choose a pickup point",
    statuses: {
      cancelled: "Cancelled",
      delivered: "Delivered",
      paid: "Paid",
      pending_payment: "Awaiting payment",
      processing: "Being prepared",
      refunded: "Refunded",
      shipped: "Shipped",
    },
    track: "Track the parcel",
    invoice: "Invoice",
    accountErrors: {
      "eshop-email-invalid": "Enter a valid email.",
      "eshop-email-taken": "An account with this email already exists.",
      "eshop-login-invalid": "The email or password does not match.",
      "eshop-login-throttled": "Too many attempts. Try again in a while.",
      "eshop-name-required": "Enter your name.",
      "eshop-password-weak": "The password needs at least 10 characters.",
      "eshop-reset-invalid": "The reset link is no longer valid. Ask for a new one.",
    },
    account: "Account",
    allProducts: "All products",
    more: "Show more",
    noProducts: "No products yet.",
    productMissing: "This product is not for sale.",
    products: "Products",
    refundClaim: "Claim your refund",
    yourOrder: "Your order",
    forgot: "Forgotten password",
    login: "Sign in",
    logout: "Sign out",
    myOrders: "My orders",
    newPassword: "New password",
    noOrders: "No orders yet.",
    password: "Password",
    register: "Create an account",
    resetDone: "Your password is set. You can sign in.",
    resetSent: "If the account exists, we sent a link to set a new password.",
    sendReset: "Send the link",
    setPassword: "Set the password",
    signedInAs: "Signed in as {{name}}",
    creditNote: "Credit note",
    paymentMethods: { btcpay: "Bitcoin", bank_transfer: "Bank transfer", comgate: "Card (Comgate)", gopay: "Card (GoPay)", stripe: "Card" },
    accountName: "Account holder", add: "Add to cart", added: "Added to cart", address: "Billing address", cart: "Cart",
    checkout: "Checkout", city: "City", continue: "Continue shopping", dueDate: "Due date", email: "Email", empty: "Your cart is empty.",
    error: "The action failed.", free: "Free", iban: "Account (IBAN)", name: "Full name", note: "Note", orderPlaced: "Order {{number}} is received.",
    outOfStock: "Sold out", pay: "Pay by bank transfer or scan the QR code in your banking app.", payment: "Payment", phone: "Phone",
    payOnline: "Pay online", paymentFailed: "The payment did not go through. Please try again.",
    paymentWaiting: "Waiting for the payment to be confirmed.",
    pickupPoint: "Pickup point", placeOrder: "Place order", postalCode: "Postal code", quantity: "Quantity", remove: "Remove",
    shipping: "Shipping", status: "Status", street: "Street and number", subtotal: "Items", total: "Total",
    variableSymbol: "Variable symbol", variant: "Variant",
  },
};

function storefrontCopy(locale: string): StorefrontCopy {
  return COPY[locale] ?? (COPY.en as StorefrontCopy);
}

export { storefrontCopy };
export type { StorefrontCopy };
