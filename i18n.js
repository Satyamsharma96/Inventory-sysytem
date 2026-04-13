const translations = {
    en: {
        welcome_back: "Welcome Back", email_addr: "Email Address", password: "Password",
        login_btn: "Login to Dashboard", no_account: "Don't have an account?", sign_up: "Sign Up",
        create_account: "Create Account", full_name: "Full Name", shop_name: "Shop Name",
        mobile_number: "Mobile Number", upload_qr: "Upload Payment QR Code", complete_signup: "Complete Signup",
        have_account: "Already have an account?", login: "Login", dashboard: "Dashboard",
        products: "Products", billing: "Billing", analytics: "Analytics", edit_profile: "Edit Profile",
        logout: "Logout", welcome: "Welcome,", total_sales: "Total Sales", total_profit: "Total Profit",
        top_product: "Top Product", total_products: "Total Products", low_stock: "Low Stock Alerts",
        expiring: "Expiring Soon", inventory_manage: "Inventory Manage", search_items: "Search items...",
        add_new_product: "Add New Product", product_name: "Product Name", purchase_selling: "Purchase / Selling (₹)",
        total_stock: "Total Stock", batches: "Batches", quick_actions: "Quick Actions", add_to_cart: "Add to Cart",
        search_product: "Search by product name...", current_cart: "Current Cart", cust_mobile: "Customer Mobile (Optional)",
        subtotal: "Subtotal", total_sp: "Total (Selling Price)", cash: "Cash", online: "Online",
        complete_checkout: "Complete Checkout", most_sold: "Most Sold Products (All Time)", monthly_rev: "Monthly Sales (Revenue)",
        save_profile: "Save Profile Config", register_prod: "Register New Product", purchase_p: "Purchase Price (₹)",
        selling_p: "Selling Price (₹)", register_btn: "Register Product", add_stock: "Add Stock", qty: "Quantity",
        expiry: "Expiry Date", scan_pay: "Scan to Pay", supports_upi: "Supports all UPI apps", confirm_pay: "Confirm Payment",
        payment_success: "Payment Successful!", print_bill: "Print Bill", send_sms: "Send SMS", skip: "Skip",
        thank_you: "Thank you for your purchase!", item: "Item", amt: "Amt", total: "Total", visit_again: "Visit Again!",
        all_good: "All stock levels look good!", no_items_expiring: "No items expiring soon.", left_stock: "left",
        units: "units", batch_text: "batch(es)", expired: "Expired", today: "Today", in_days: "In {x} day(s)",
        cart_empty: "Cart is empty", no_data: "No Data", in_stock: "in stock",
        location_txt: "Location", rack_name: "Rack", side: "Side", shelf: "Shelf",
        left: "Left", right: "Right", top: "Top", middle: "Middle", bottom: "Bottom",
        edit_product: "Edit Product", save_changes: "Save Changes", opt: "(Opt)",
        all_racks: "All Racks", udhaar_book: "Udhaar Book", udhaar_manage: "Udhaar Ledger",
        active_dues: "Active Dues", cleared_dues: "Cleared Accounts",
        add_payment: "Add Payment", pending_due: "Pending:", cleared_txt: "Cleared",
        all_dues_cleared: "All dues cleared for",
        udhaar_pending_msg: "{name} ka ₹{amount} pending hai",
        days_since: "Last paid: {days} days ago", today_paid: "Last paid: Today", never_paid: "Never paid",
        record_payment: "Record Payment", settle_due: "Full Settle (₹{amount})", partial_pay: "Partial Payment",
        history: "History", payment_history: "Payment History",
        amount_paying: "Amount Paying (₹)", save_payment: "Save Payment",
        mobile_req: "Mobile Number (Required for Udhaar)",
        enter_name: "Customer Name",
        udhaar_btn: "Credit / Udhaar"
    },
    hi: {
        welcome_back: "वापसी पर स्वागत है", email_addr: "ईमेल पता", password: "पासवर्ड",
        login_btn: "डैशबोर्ड में प्रवेश करें", no_account: "क्या आपके पास खाता नहीं है?", sign_up: "साइन अप करें",
        create_account: "खाता बनाएं", full_name: "पूरा नाम", shop_name: "दुकान का नाम",
        mobile_number: "मोबाइल नंबर", upload_qr: "भुगतान क्यूआर कोड अपलोड करें", complete_signup: "साइन अप पूरा करें",
        have_account: "क्या आपके पास पहले से खाता है?", login: "लॉग इन करें", dashboard: "डैशबोर्ड",
        products: "उत्पाद", billing: "बिलिंग", analytics: "एनालिटिक्स", edit_profile: "प्रोफ़ाइल संपादित करें",
        logout: "लॉग आउट", welcome: "स्वागत है,", total_sales: "कुल बिक्री", total_profit: "कुल लाभ",
        top_product: "शीर्ष उत्पाद", total_products: "कुल उत्पाद", low_stock: "कम स्टॉक अलर्ट",
        expiring: "जल्द समाप्त होने वाला", inventory_manage: "इन्वेंटरी प्रबंधन", search_items: "आइटम खोजें...",
        add_new_product: "नया उत्पाद जोड़ें", product_name: "उत्पाद का नाम", purchase_selling: "खरीद / बिक्री (₹)",
        total_stock: "कुल स्टॉक", batches: "बैच", quick_actions: "त्वरित कार्रवाइयां", add_to_cart: "कार्ट में डालें",
        search_product: "उत्पाद के नाम से खोजें...", current_cart: "वर्तमान कार्ट", cust_mobile: "ग्राहक मोबाइल (वैकल्पिक)",
        subtotal: "उप-योग", total_sp: "कुल (बिक्री मूल्य)", cash: "नकद", online: "ऑनलाइन",
        complete_checkout: "चेकआउट पूरा करें", most_sold: "शीर्ष बिकने वाले उत्पाद", monthly_rev: "मासिक बिक्री (राजस्व)",
        save_profile: "प्रोफ़ाइल सहेजें", register_prod: "नया उत्पाद पंजीकृत करें", purchase_p: "खरीद मूल्य (₹)",
        selling_p: "बिक्री मूल्य (₹)", register_btn: "उत्पाद पंजीकृत करें", add_stock: "स्टॉक जोड़ें", qty: "मात्रा",
        expiry: "समाप्ति तिथि", scan_pay: "स्कैन करें और भुगतान करें", supports_upi: "सभी UPI ऐप्स का समर्थन करता है",
        confirm_pay: "भुगतान की पुष्टि करें", payment_success: "भुगतान सफल!", print_bill: "बिल प्रिंट करें", send_sms: "SMS भेजें",
        skip: "छोड़ें", thank_you: "आपकी खरीदारी के लिए धन्यवाद!", item: "सामग्री", amt: "रकम", total: "कुल", visit_again: "फिर से आएं!",
        all_good: "सभी स्टॉक स्तर अच्छे हैं!", no_items_expiring: "जल्द समाप्त होने वाला कोई आइटम नहीं है।", left_stock: "बचे हैं",
        units: "इकाइयां", batch_text: "बैच", expired: "समाप्त हो गया", today: "आज", in_days: "{x} दिन(ों) में",
        cart_empty: "कार्ट खाली है", no_data: "कोई डेटा नहीं", in_stock: "स्टॉक में",
        location_txt: "स्थान", rack_name: "रैक", side: "पक्ष", shelf: "शेल्फ",
        left: "बायां", right: "दायां", top: "ऊपर", middle: "मध्य", bottom: "नीचे",
        edit_product: "उत्पाद संपादित करें", save_changes: "परिवर्तन सहेजें", opt: "(वैकल्पिक)",
        all_racks: "सभी रैक", udhaar_book: "उधार खाता", udhaar_manage: "उधार लेज़र",
        active_dues: "बकाया खातें", cleared_dues: "चुकाए गए खातें",
        add_payment: "भुगतान जोड़ें", pending_due: "बकाया:", cleared_txt: "चुकाया गया",
        all_dues_cleared: "सभी बकाया चुका दिए गए:",
        udhaar_pending_msg: "{name} का ₹{amount} बकाया है",
        days_since: "अंतिम भुगतान: {days} दिन पहले", today_paid: "अंतिम भुगतान: आज", never_paid: "भुगतान नहीं हुआ",
        record_payment: "भुगतान दर्ज करें", settle_due: "पूरा चुकाएं (₹{amount})", partial_pay: "आंशिक भुगतान",
        history: "इतिहास", payment_history: "भुगतान इतिहास",
        amount_paying: "भुगतान राशि (₹)", save_payment: "भुगतान सहेजें",
        mobile_req: "मोबाइल नंबर (उधार के लिए आवश्यक)",
        enter_name: "ग्राहक का नाम",
        udhaar_btn: "उधार"
    }
};

let currentLang = localStorage.getItem('appLang') || 'en';

function t(key, params = {}) {
    let str = translations[currentLang][key] || key;
    for (let k in params) {
        str = str.replace(`{${k}}`, params[k]);
    }
    return str;
}

function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.innerText = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
}
