# Android SMS Bridge

Personal Android bridge app for automatic UPI credit SMS forwarding to the PC app.

## What it does

- Listens for new incoming SMS after the user grants SMS permission.
- Filters for likely credit/payment-received messages.
- Sends the SMS text to the PC endpoint:

```text
http://YOUR_LAPTOP_IP:4180/api/sms-payment
```

The PC app parses amount/from/reference and plays the payment alert sound.

## Important

This is for personal sideload/testing. Google Play restricts SMS permissions for normal apps, so do not expect this kind of app to be publishable on Play Store without an approved SMS permission use case.

## Build

Open this folder in Android Studio, connect your Android phone, and run the `app` configuration.

On the phone, set PC URL to something like:

```text
http://192.168.1.8:4180/api/sms-payment
```

Grant SMS permission when asked.
