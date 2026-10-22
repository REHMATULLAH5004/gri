# WhatsApp messages for prescriptions: setup

The shop database now sends two WhatsApp messages by itself:

1. **When a customer uploads a prescription** -> "We have received your prescription..."
2. **When the pharmacist sends the quotation** -> "You have received a quotation..." with the quotation PDF attached and a button that opens the quotation in the shop.

The system side is built and switched on, but it sends nothing until you finish steps 1 to 4 below.

## 1. Meta WhatsApp Business setup (you do this once)
1. Go to developers.facebook.com and create an app of type **Business**, then add the **WhatsApp** product.
2. Add and verify your pharmacy's WhatsApp number (a number that is not already used in the normal WhatsApp app).
3. Note two values: the **Phone number ID** and a **permanent access token** (create a System User in Business Settings, give it WhatsApp permissions, and generate a token that never expires).

## 2. Create the two message templates (WhatsApp Manager > Message templates)
Category: **Utility**. Language: **English** (code `en`). Meta usually approves within a day.

### Template 1. Name: `prescription_received`
Body:
```
Hello {{1}}, we have received your prescription (Ref #{{2}}). Our pharmacist will review the prescription and send you the quotation shortly. - Griffins Medicals Limited
```
Sample values: {{1}} = Mwila, {{2}} = a1b2c3d4

### Template 2. Name: `quotation_ready`
Header type: **Document** (upload any sample PDF).
Body:
```
Hello {{1}}, you have received a quotation for the prescription you sent (Ref #{{2}}). Total: ZMW {{3}}. Please review the quotation and place your order.
```
Button: **Visit website**, type **Dynamic**, button text `Review & Order`, URL:
```
https://YOUR-SHOP-ADDRESS/pages/home/index.html?quote={{1}}
```
(Replace YOUR-SHOP-ADDRESS with the real address of your shop. It cannot be changed later without a new template.)
Sample value for the button: a1b2c3d4-0000-0000-0000-000000000000

## 3. Add the secrets (Supabase dashboard, shop project > Edge Functions > Secrets)
| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | the permanent access token from step 1 |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID from step 1 |
| `SHOP_BASE_URL` | your shop address, e.g. https://yourshop.com |

Optional (only if you used different template names or language): `WA_TEMPLATE_RECEIVED`, `WA_TEMPLATE_QUOTATION`, `WA_TEMPLATE_LANG`.

Keep the token private: never put it in the shop code or send it in chat.

## 4. Test
1. Sign in to the shop as a test customer whose profile has your own phone number.
2. Upload a prescription -> you should get message 1 within seconds.
3. In the admin page, prepare and send the quotation -> you should get message 2 with the PDF and the button.
4. If nothing arrives, look at the table `whatsapp_log` in the shop database: each row shows `sent`, `skipped` (for example no valid phone number) or `failed` with the reason.

## Good to know
- Phone numbers are read from each customer's profile. Formats like 0977123456 and +260977123456 both work.
- Each message is sent once per prescription. A failed message is retried the next time the same event happens.
- The quotation PDF is kept in a private storage area; the link inside WhatsApp works for 7 days.
- Meta only allows messages to customers who agreed to receive them. The upload dialog now says "We will update you on WhatsApp" next to the customer's number.
- If the pharmacist rejects a prescription, no WhatsApp message is sent yet (this can be added).
