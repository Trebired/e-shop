type StorefrontCopy = Record<
"accountName" | "add" | "added" | "address" | "cart" | "checkout" | "city" | "continue" | "email" | "empty" | "iban" | "name" | "note"
|"orderPlaced" | "outOfStock" | "pay" | "payment" | "phone" | "placeOrder" | "postalCode" | "quantity" | "remove" | "shipping" | "status"
|"street" | "subtotal" | "total" | "variant" | "variableSymbol" | "dueDate" | "free" | "pickupPoint" | "error",
string
>;

const COPY: Record<string, StorefrontCopy> = {
  cs: {
    accountName: "Majitel účtu", add: "Přidat do košíku", added: "Přidáno do košíku", address: "Fakturační adresa", cart: "Košík",
    checkout: "Pokladna", city: "Město", continue: "Pokračovat v nákupu", dueDate: "Splatnost", email: "E-mail", empty: "Košík je prázdný.",
    error: "Akce se nepovedla.", free: "Zdarma", iban: "Účet (IBAN)", name: "Jméno a příjmení", note: "Poznámka", orderPlaced: "Objednávka " +
      "{{number}} je přijatá.",
    outOfStock: "Vyprodáno", pay: "Zaplaťte převodem nebo naskenujte QR kód v bankovní aplikaci.", payment: "Platba", phone: "Telefon",
    pickupPoint: "Výdejní místo", placeOrder: "Objednat s povinností platby", postalCode: "PSČ", quantity: "Množství", remove: "Odebrat",
    shipping: "Doprava", status: "Stav", street: "Ulice a číslo", subtotal: "Zboží", total: "Celkem",
    variableSymbol: "Variabilní symbol", variant: "Varianta",
  },
  en: {
    accountName: "Account holder", add: "Add to cart", added: "Added to cart", address: "Billing address", cart: "Cart",
    checkout: "Checkout", city: "City", continue: "Continue shopping", dueDate: "Due date", email: "Email", empty: "Your cart is empty.",
    error: "The action failed.", free: "Free", iban: "Account (IBAN)", name: "Full name", note: "Note", orderPlaced: "Order {{number}} is received.",
    outOfStock: "Sold out", pay: "Pay by bank transfer or scan the QR code in your banking app.", payment: "Payment", phone: "Phone",
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
