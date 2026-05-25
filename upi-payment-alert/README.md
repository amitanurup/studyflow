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

## Automatic SMS mode

Manual mobile form ke alawa Android SMS Bridge starter app bhi included hai:

```text
upi-payment-alert/android-sms-bridge
```

Flow:

1. PC dashboard open rakhein: `http://localhost:4180`
2. Dashboard se **Android SMS Bridge endpoint** copy karein, e.g.

```text
http://192.168.1.8:4180/api/sms-payment
```

3. `android-sms-bridge` folder Android Studio me open karein.
4. App phone par install/run karein.
5. App me endpoint paste karke save karein.
6. SMS permission allow karein.
7. Jab credit/payment-received SMS aayega, bridge PC app ko bhejega.

## Note

Normal browser pages cannot read GPay, PhonePe, Paytm, bank-app notifications, or SMS automatically. Automatic SMS mode needs a real Android app with SMS permission. Google Play restricts SMS permissions for normal apps, so this bridge is meant for personal sideload/testing.
