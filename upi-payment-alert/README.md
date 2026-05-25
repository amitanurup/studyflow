# UPI Payment Alert

Separate local web app for syncing a payment-received alert from mobile to PC.

## Run

Double-click `start-upi-alert.bat`, or run:

```powershell
cd upi-payment-alert
npm start
```

Open PC dashboard:

```text
http://localhost:4180
```

Open the shown mobile link on a phone connected to the same Wi-Fi.

## Note

Normal browser pages cannot read GPay, PhonePe, Paytm, or bank-app notifications automatically. This app is a mobile-to-PC alert bridge: enter the received amount on the mobile page, and the PC dashboard shows a popup with sound.
