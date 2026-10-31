// Golden Hour Copilot - vehicle crash sensor simulator (Wokwi, ESP32 + MPU6050).
// Wiring: MPU6050 VCC->3V3, GND->GND, SDA->GPIO21, SCL->GPIO22.
// Sends one accelerometer reading (m/s2) every SEND_INTERVAL_MS to POST /api/sensors/readings/.
// The backend decides whether it is a possible collision; nothing is decided on the device.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
// Your ngrok URL + the endpoint path. No trailing spaces.
const char* SERVER_URL = "https://YOUR_NGROK_DOMAIN/api/sensors/readings/";
// Must equal SENSOR_DEVICE_TOKEN in the backend .env. Demo only: never put a real secret in a public sketch.
const char* DEVICE_TOKEN = "YOUR_DEMO_DEVICE_TOKEN";
const char* DEVICE_ID = "CAR-001";
const unsigned long SEND_INTERVAL_MS = 1000;

Adafruit_MPU6050 mpu;
unsigned long sequence = 0;
unsigned long lastSend = 0;

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(" connected");
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  while (!mpu.begin()) {
    Serial.println("MPU6050 not found, retrying...");
    delay(1000);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_16_G);  // default 2 g would clip every crash
  connectWifi();
}

void sendReading(float x, float y, float z) {
  if (WiFi.status() != WL_CONNECTED) connectWifi();

  WiFiClientSecure client;
  client.setInsecure();  // demo: skip certificate check for the ngrok tunnel
  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("ngrok-skip-browser-warning", "1");

  char body[256];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"source\":\"WOKWI_SIMULATOR\",\"sequence\":%lu,"
           "\"acceleration\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f},\"unit\":\"m/s2\"}",
           DEVICE_ID, sequence, x, y, z);

  int status = http.POST(body);
  Serial.printf("#%lu x=%.2f y=%.2f z=%.2f -> HTTP %d %s\n", sequence, x, y, z, status, http.getString().c_str());
  http.end();
}

void loop() {
  if (millis() - lastSend < SEND_INTERVAL_MS) return;
  lastSend = millis();

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);  // a.acceleration is already in m/s2
  sequence++;
  sendReading(a.acceleration.x, a.acceleration.y, a.acceleration.z);
}
