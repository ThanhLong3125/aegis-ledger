# 📖 Giải Mã Toàn Diện `@aegis/event-bus`: NestJS Dependency Injection, Factory Pattern & Bảng Đối Chiếu Cú Pháp Kafka

> **Mục tiêu tài liệu:** Dành cho các kỹ sư mới làm quen với NestJS, TypeScript nâng cao (Dynamic Modules, Custom Providers, Injection Tokens) hoặc đang băn khoăn về sự khác biệt giữa cú pháp chuẩn trong tài liệu NestJS (`@EventPattern`, `client.emit`) và cú pháp chuyên biệt trong thư viện này.  
> **Tài liệu trả lời:**  
> 1. *Từng từ khóa lạ trong `EventBusModule` (`forRoot`, `forRootAsync`, `useValue`, `EVENT_BUS_OPTIONS`) có ý nghĩa gì?*  
> 2. *Tại sao lại có `KafkaClientFactory`? Nó kết nối khi nào?*  
> 3. *Bảng đối chiếu 1:1 giữa cú pháp Docs NestJS và cú pháp mã nguồn dự án.*  
> 4. *Chỉ rõ chính xác: Dòng nào là **EMIT (phát)** sự kiện? Dòng nào là **RECEIVE (nhận)** sự kiện?*

---

## 🧭 PHẦN 1: Giảng Giải Từng Cú Pháp NestJS & TypeScript Trong `EventBusModule`

Nếu bạn mới học NestJS, file [`src/modules/event-bus.module.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/event-bus/src/modules/event-bus.module.ts) có thể trông rất đáng sợ vì nó sử dụng kỹ thuật **Dynamic Module (Module Động)**. Hãy bóc tách từng khái niệm:

```
┌────────────────────────────────────────────────────────────────────────┐
│ STATIC MODULE (Module Tĩnh - Cơ bản)                                  │
│ @Module({ imports: [AuthModule] })                                     │
│ 👉 Cấu hình cố định, không thể truyền tham số (như địa chỉ IP Broker). │
└────────────────────────────────────────────────────────────────────────┘
                                    VS
┌────────────────────────────────────────────────────────────────────────┐
│ DYNAMIC MODULE (Module Động - Nâng cao)                                │
│ EventBusModule.forRoot({ brokers: ['localhost:9092'] })               │
│ 👉 Cho phép truyền tham số cấu hình linh hoạt từ bên ngoài vào!       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 1.1. Giải mã `EventBusModule.forRoot(options)`

Hãy xem từng dòng code trong `event-bus.module.ts`:

```typescript
@Global() // 👈 1. Toàn cục: Import 1 lần ở AppModule, mọi Service khác đều dùng được
@Module({
  providers: [KafkaClientFactory, KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService, KafkaClientFactory],
})
export class EventBusModule {
  
  // 👈 2. Hàm Static: Trả về một đối tượng "DynamicModule"
  static forRoot(options?: KafkaConfigOptions): DynamicModule {
    return {
      module: EventBusModule,
      providers: [
        {
          provide: EVENT_BUS_OPTIONS, // 👈 3. Custom Provider Token (Tên nhãn ngăn kéo)
          useValue: options || {},    // 👈 4. Cất giá trị options vào ngăn kéo đó
        },
        KafkaClientFactory,
        KafkaProducerService,
        KafkaConsumerService,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, KafkaClientFactory],
    };
  }
}
```

* **Khái niệm 1: `@Global()` là gì?**
  * Bình thường trong NestJS, nếu `WalletModule` muốn dùng `KafkaProducerService`, nó phải `imports: [EventBusModule]`. Nếu bạn có 10 module thì phải import 10 lần.
  * `@Global()` biến module này thành "dịch vụ toàn cục": Bạn chỉ cần khai báo nó 1 lần duy nhất tại `AppModule`, tất cả các module khác trong hệ thống tự động nhìn thấy và dùng được ngay!
* **Khái niệm 2: `provide: EVENT_BUS_OPTIONS` và `useValue` là gì?**
  * Trong NestJS, hệ thống Dependency Injection (DI) hoạt động như một **tủ đựng đồ có nhiều ngăn kéo**: Mỗi ngăn kéo có một chiếc **Nhãn (Token)** để nhận diện.
  * Ở đây, `EVENT_BUS_OPTIONS` là một chuỗi hằng số `'EVENT_BUS_OPTIONS'`.
  * Dòng `{ provide: EVENT_BUS_OPTIONS, useValue: options }` nghĩa là: *"Hãy dán nhãn `EVENT_BUS_OPTIONS` lên ngăn kéo, và nhét đối tượng `options` (chứa danh sách brokers, clientId...) vào đó!"*
  * **Module hoàn toàn KHÔNG mở kết nối mạng!** Nó chỉ cất cấu hình vào ngăn kéo mà thôi.

---

### 1.2. Giải mã `forRootAsync()`: Tại sao lại cần?

Trong thực tế, địa chỉ Kafka Broker thường nằm trong file `.env` được đọc qua `ConfigService`. Khi ứng dụng vừa bật lên, `ConfigService` cần một vài mili-giây để đọc file `.env`. Nếu dùng `forRoot()` đồng bộ, app sẽ bị lỗi do chưa kịp đọc biến môi trường.

`forRootAsync()` giải quyết việc này bằng cách cho phép bạn truyền vào một hàm bất đồng bộ `useFactory`:
```typescript
EventBusModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    brokers: [config.get('KAFKA_BROKER')], // Chờ ConfigService đọc xong mới lấy!
    clientId: 'wallet-app',
  }),
})
```

---

## 🏭 PHẦN 2: Giải Mã `KafkaClientFactory` (Nơi Kết Nối Mạng Thực Sự)

File: [`src/services/kafka-client.factory.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/event-bus/src/services/kafka-client.factory.ts)

```typescript
@Injectable()
export class KafkaClientFactory implements OnModuleDestroy {
  // Biến lưu kết nối dạng Singleton (chỉ tạo 1 lần duy nhất)
  private kafkaInstance: Kafka | null = null;
  private producerInstance: Producer | null = null;

  constructor(
    @Optional() // 👈 Nếu người dùng không truyền options thì không bị báo lỗi đỏ
    @Inject(EVENT_BUS_OPTIONS) // 👈 "Mở ngăn kéo EVENT_BUS_OPTIONS lấy cấu hình ra!"
    private readonly options?: KafkaConfigOptions,
  ) {}
```

* **`@Inject(EVENT_BUS_OPTIONS)`:**
  * Đây chính là nơi liên kết với Module ở trên! Factory bảo NestJS: *"Hãy mở ngăn kéo có dán nhãn `EVENT_BUS_OPTIONS` mà Module đã cất, đưa cấu hình đó vào biến `this.options` cho tôi!"*
* **Cơ chế "Kết nối Lười" (Lazy Connection):**
  * Khi Factory được khởi tạo, nó **chưa hề kết nối tới Kafka**.
  * Chỉ khi nào có service gọi hàm `await factory.getProducer()`, lúc đó dòng `await this.producerInstance.connect()` mới thực sự kích hoạt một đường truyền socket TCP đến máy chủ Kafka!

---

## 🥊 PHẦN 3: Bảng Đối Chiếu 1:1 Cú Pháp NestJS Docs vs Cú Pháp Dự Án

Dưới đây là bảng so sánh trực quan giữa cú pháp bạn đọc được trên trang chủ NestJS và cú pháp mà chúng ta đang sử dụng trong `@aegis/event-bus`:

| Nghiệp vụ | Cách viết trên NestJS Docs (`@nestjs/microservices`) | Cách viết trong dự án AegisLedger (`@aegis/event-bus`) | Lý do ta chọn cách này |
| :--- | :--- | :--- | :--- |
| **Khai báo Client** | `ClientsModule.register([{ name: 'KAFKA', transport: Transport.KAFKA }])` | `EventBusModule.forRoot({ brokers: ['...'] })` | Tự do cấu hình chi tiết KafkaJS (retry, SSL, DLQ flag). |
| **Inject vào Service** | `@Inject('KAFKA') private client: ClientKafka` | `constructor(private producer: KafkaProducerService)` | Type-safe 100%, không cần gõ string token lặp lại. |
| **Bắn sự kiện (EMIT)** | `this.client.emit('topic', { key, value })` | `await this.producer.publishAuditEvent(event)` | **Bắt buộc phải có `streamKey`**, tự inject Correlation ID và Tracing Headers. |
| **Lắng nghe sự kiện (CONSUME)** | `@EventPattern('topic')`<br>`handle(@Payload() data, @Ctx() ctx)` (Viết trong `@Controller`) | `await this.consumer.subscribe({ topic, dtoClass, handler })` (Viết trong Service bất kỳ) | Cho phép **gom lô (Sliding Window Buffer)** trước khi băm Merkle Tree; tự bắt lỗi DTO và đẩy sang DLQ. |
| **Xác thực DTO đầu vào** | Phải cấu hình `ValidationPipe` toàn cục hoặc tự viết Interceptor | Tự động chạy qua `plainToInstance` + `validateOrReject` ngay trong lõi | Đảm bảo dữ liệu 100% sạch trước khi đưa vào Cây Merkle. |

---

## 🎯 PHẦN 4: Chỉ Rõ Chính Xác Đoạn Nào Là EMIT, Đoạn Nào Là NHẬN

Đây là phần quan trọng nhất giúp bạn hình dung dòng chảy dữ liệu trong code:

```
[SERVICE NGHIỆP VỤ: wallet-core]
               │
               ▼  1. GỌI LỆNH EMIT (BẮN TIN)
┌────────────────────────────────────────────────────────┐
│ await this.producer.publishAuditEvent(event);          │
└──────────────────────┬─────────────────────────────────┘
                       │
                       │ 2. KafkaProducerService thực hiện:
                       │    await producer.send({ topic, messages: [{ key, value }] })
                       ▼
          [KAFKA BROKER: aegis_kafka:9092]
                       │
                       │ 3. KafkaConsumerService đang cắm socket chờ:
                       │    consumer.run({ eachMessage: async (...) => { ... } })
                       ▼
┌────────────────────────────────────────────────────────┐
│ 4. Kiểm tra JSON ➔ Thẩm định DTO ➔ Bàn giao sạch       │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼ 5. GỌI LỆNH NHẬN (CONSUME HANDLER)
[SERVICE XỬ LÝ LÕI: audit-ledger]
handler: async (event, context) => {
   // Nhận được dữ liệu sạch ➔ Đưa vào Sliding Window để băm Cây Merkle!
}
```

---

### 📤 1. ĐOẠN NÀO LÀ "EMIT EVENT" (PHÁT SỰ KIỆN)?

Có 2 cấp độ Emit trong mã nguồn:

#### Cấp độ 1: Ứng dụng nghiệp vụ gọi (Ví dụ trong `wallet.service.ts`)
👉 **ĐÂY CHÍNH LÀ LỆNH EMIT MÀ BẠN SẼ VIẾT HÀNG NGÀY:**
```typescript
@Injectable()
export class WalletService {
  constructor(private readonly producer: KafkaProducerService) {}

  async transfer() {
    // 👉 ĐÂY LÀ DÒNG LỆNH PHÁT SỰ KIỆN (EMIT EVENT):
    await this.producer.publishAuditEvent(event);
  }
}
```

#### Cấp độ 2: Bên trong thư viện thực thi (File [`kafka-producer.service.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/event-bus/src/services/kafka-producer.service.ts#L65-L105))
👉 **ĐÂY LÀ ĐOẠN CODE THỰC SỰ BẮN GÓI TIN SOCKET LÊN KAFKA BROKER:**
```typescript
// Tại dòng 89 của kafka-producer.service.ts:
const recordMetadata = await producer.send({
  topic: 'aegis.audit.events',
  messages: [
    {
      key: event.streamKey,   // Khóa phân vùng
      value: Buffer.from(JSON.stringify(payload), 'utf8'), // Dữ liệu thô
      headers: headers,       // Headers truy vết
    },
  ],
});
```
*(Trong NestJS Docs nó là `client.emit()`, còn ở KafkaJS gốc lệnh này tên là `producer.send()`)*.

---

### 📥 2. ĐOẠN NÀO LÀ "RECEIVE / CONSUME EVENT" (NHẬN SỰ KIỆN)?

Cũng có 2 cấp độ:

#### Cấp độ 1: Bên trong thư viện lắng nghe socket (File [`kafka-consumer.service.ts`](file:///home/thanhlong/Documents/aegis-ledger-workspace/libs/event-bus/src/services/kafka-consumer.service.ts#L50-L105))
👉 **ĐÂY LÀ NƠI KAFKA NHẢ TIN NHẮN VÀO TIẾN TRÌNH NODE.JS:**
```typescript
// Tại dòng 50 của kafka-consumer.service.ts:
await consumer.run({
  autoCommit: true,
  // 👇 ĐOẠN NÀY ĐƯỢC GỌI MỖI KHI CÓ TIN NHẮN TỪ KAFKA BAY VỀ SOCKET:
  eachMessage: async ({ topic, partition, message }) => {
    const rawPayload = message.value.toString('utf8');
    
    // Khâu 1: Parse JSON
    // Khâu 2: Thẩm định DTO qua validateOrReject()
    // Khâu 3: Gọi hàm nghiệp vụ của bạn:
    await handler(validatedData, context); 
  },
});
```

#### Cấp độ 2: Ứng dụng nghiệp vụ nhận dữ liệu (Ví dụ trong `audit-ledger.service.ts`)
👉 **ĐÂY LÀ NƠI BẠN ĐÓN NHẬN VÀ XỬ LÝ SỰ KIỆN ĐÃ ĐƯỢC LỌC SẠCH:**
```typescript
@Injectable()
export class AuditLedgerService implements OnModuleInit {
  constructor(private readonly consumer: KafkaConsumerService) {}

  async onModuleInit() {
    // Đăng ký nhận tin:
    await this.consumer.subscribe<AuditEventDto>({
      topic: TOPIC_AUDIT_EVENTS,
      groupId: CONSUMER_GROUP_AUDIT_LEDGER,
      dtoClass: AuditEventDto,
      
      // 👇 ĐÂY CHÍNH LÀ NƠI NHẬN EVENT ĐỂ XỬ LÝ NGHIỆP VỤ:
      handler: async (event, context) => {
        console.log(`Đã nhận giao dịch của user: ${event.actor.userId}`);
        console.log(`Thuộc Partition: ${context.partition}, Offset: ${context.offset}`);
        
        // Đưa vào In-Memory Sliding Window để chuẩn bị băm Cây Merkle!
        await this.buffer.push(event);
      },
    });
  }
}
```
*(Trong NestJS Docs nó là hàm có gắn `@EventPattern()`, còn ở đây nó là hàm `handler: async (event) => { ... }`)*.

---

### 💡 Tóm Tắt Để Dễ Nhớ Nhất:
1. **Module** chỉ là nơi **cất cấu hình** vào tủ.
2. **Factory** là người thợ kỹ thuật **cắm dây mạng TCP thật** tới Kafka khi có lệnh.
3. **Emit (Bắn tin)**: Gọi `producer.publishAuditEvent(event)` (bên trong chạy `producer.send(...)`).
4. **Receive (Nhận tin)**: Gọi `consumer.subscribe({ handler: async (event) => { ... } })` (bên trong chạy vòng lặp `consumer.run({ eachMessage: ... })`).
5. Toàn bộ cơ chế thẩm định DTO và đẩy tin rác sang DLQ diễn ra tự động ở giữa khâu nhận tin, giúp code nghiệp vụ của bạn an toàn 100%.

---

*Tài liệu này được biên soạn độc quyền cho hệ thống AegisLedger nhằm làm sáng tỏ toàn bộ kiến trúc truyền dẫn thông điệp.*
