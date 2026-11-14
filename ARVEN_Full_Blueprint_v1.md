**ARVEN**

*BEYOND TRENDS. BEYOND TIME.*

**FULL PRODUCT, BUSINESS & TECHNICAL BLUEPRINT**

| **DOCUMENT CONTROL** | **VALUE**                                                    |
|----------------------|--------------------------------------------------------------|
| Version              | 1.0                                                          |
| Date                 | 14 November 2026                                             |
| Project              | ARVEN Luxury Contemporary Fashion E-Commerce                 |
| Product model        | Direct-to-Consumer (D2C), unisex apparel                     |
| Experience           | Hybrid 3D: Product Viewer + Virtual Showroom + Outfit Studio |
| Scope                | Full platform: Storefront, Admin, API, Worker, Operations    |
| Status               | Baseline blueprint for discovery and engineering planning    |

*Prepared as an implementation reference. Commercial assumptions and technical version pins require validation at project kickoff.*

# Daftar Isi

- 1\. Ringkasan Eksekutif dan Batas Proyek

- 2\. Identitas Bisnis dan Strategi Produk

- 3\. Target Pengguna dan Customer Journey

- 4\. Product Requirements Document

- 5\. Business Process dan Aturan Operasional

- 6\. Sitemap, UX, dan Design System

- 7\. System Architecture dan Technology Decisions

- 8\. Monorepo dan Struktur Aplikasi

- 9\. Backend Domain Architecture

- 10\. Database Architecture dan Data Dictionary

- 11\. API Specification dan Contract

- 12\. Checkout, Inventory, dan Payment Transactions

- 13\. 3D Experience dan Asset Pipeline

- 14\. Admin Dashboard dan RBAC

- 15\. Security Architecture dan Threat Model

- 16\. Background Jobs, Events, dan Integrasi

- 17\. DevOps, Deployment, dan Observability

- 18\. QA, Testing, dan Acceptance Criteria

- 19\. Roadmap dan Engineering Backlog

- 20\. Risiko, Asumsi, dan Keputusan Terbuka

- 21\. Referensi Teknis Resmi

| **Cara menggunakan dokumen** Jadikan dokumen ini baseline. Setiap perubahan terhadap scope, skema data, status transaksi, dan pipeline 3D harus dicatat melalui issue dan Architecture Decision Record (ADR). |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 1. Ringkasan Eksekutif dan Batas Proyek

## 1.1 Visi produk

ARVEN adalah platform e-commerce fashion premium dengan pengalaman belanja berbasis editorial dan visualisasi 3D. Pelanggan dapat menemukan produk, mempelajari bahan dan detail, melihat model 3D, mengubah pilihan warna yang tersedia, menjelajahi virtual showroom, menyusun outfit, lalu menyelesaikan transaksi melalui checkout standar.

Platform terdiri dari customer storefront, admin dashboard, backend API, dan background worker. PostgreSQL menjadi sumber kebenaran untuk katalog, stok, order, payment state, dan aktivitas operasional. Model 3D disimpan di object storage dan didistribusikan melalui CDN.

## 1.2 Tujuan bisnis

| **Tujuan**                         | **Hasil yang diharapkan**                           | **Metrik**                            |
|------------------------------------|-----------------------------------------------------|---------------------------------------|
| Meningkatkan product discovery     | Pelanggan menemukan koleksi dan varian lebih cepat  | Search usage, product views           |
| Meningkatkan keyakinan pembelian   | Informasi produk dan 3D viewer membantu evaluasi    | Add-to-cart rate, 3D engagement       |
| Mendukung transaksi D2C            | Checkout, payment, order, dan shipping terintegrasi | Checkout completion, payment success  |
| Meningkatkan efisiensi operasional | Admin mengelola katalog, stok, dan order terpusat   | Order processing time, stock accuracy |
| Memperkuat brand experience        | Tampilan konsisten di storefront dan editorial      | Engaged sessions, returning customers |

## 1.3 Batas scope

| **Masuk scope**                                                                            | **Di luar scope rilis pertama**                                    |
|--------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| Storefront, katalog, varian, cart, checkout, payment, order                                | Marketplace multi-vendor                                           |
| Admin, inventory, CMS, coupons, returns dasar, analytics                                   | ERP manufaktur dan akuntansi penuh                                 |
| 3D product viewer, color/material preset, showroom, outfit studio berbasis aset siap pakai | Simulasi kain fisika real-time dan virtual fitting akurat          |
| Integrasi payment dan shipping melalui provider adapter                                    | Aplikasi native iOS/Android                                        |
| Role/permission, audit trail, monitoring, automated tests                                  | Multi-country tax engine dan multi-warehouse optimization lanjutan |

## 1.4 Prinsip produk

- **Commerce-first:** pengguna tetap bisa membeli produk tanpa WebGL, avatar, atau showroom.

- **Server-authoritative:** harga, diskon, stok, order, dan payment state ditentukan backend.

- **Progressive enhancement:** fitur 3D dimuat sesuai kemampuan perangkat dan koneksi.

- **Asset-driven:** 3D assets memiliki metadata, versi, status validasi, dan fallback.

- **Operational transparency:** setiap perubahan stok, pembayaran, order, dan akses admin dapat diaudit.

- **Modular monolith:** domain dipisahkan secara logis tanpa kompleksitas microservices sejak awal.

## 1.5 Asumsi baseline

| **Area**    | **Asumsi kerja**                                                                           |
|-------------|--------------------------------------------------------------------------------------------|
| Pasar awal  | Indonesia; mata uang transaksi IDR; timezone operasional Asia/Jakarta                      |
| Bahasa      | Bahasa Indonesia sebagai bahasa utama; struktur siap untuk English                         |
| Katalog     | Unisex apparel, footwear, accessories; produk memiliki variant SKU                         |
| Fulfillment | Satu gudang utama pada peluncuran; model data siap multi-gudang                            |
| Payment     | Midtrans sebagai provider pertama; adapter disiapkan untuk provider lain                   |
| Shipping    | Provider agregator/kurir terpilih setelah uji kebutuhan dan kontrak                        |
| Brand       | ARVEN adalah working brand name; pengecekan merek/domain masih diperlukan                  |
| Tim         | Asumsi tim kecil, dengan pekerjaan desain, backend, frontend, dan aset 3D sebagian paralel |

# 2. Identitas Bisnis dan Strategi Produk

## 2.1 Brand positioning

| **Elemen**        | **Definisi**                                                                  |
|-------------------|-------------------------------------------------------------------------------|
| Brand             | ARVEN                                                                         |
| Tagline           | Beyond Trends. Beyond Time.                                                   |
| Kategori          | Luxury contemporary fashion                                                   |
| Model bisnis      | Direct-to-Consumer (D2C)                                                      |
| Target            | Pria dan wanita usia dewasa muda hingga profesional                           |
| Karakter          | Minimalist, modern, timeless, functional                                      |
| Visual            | Editorial photography, neutral palette, premium typography                    |
| Value proposition | Produk fashion terkurasi dengan presentasi digital yang detail dan interaktif |

## 2.2 Product catalog taxonomy

| **Kategori** | **Subkategori**                  | **Contoh item**                               |
|--------------|----------------------------------|-----------------------------------------------|
| Tops         | T-shirt, shirt, polo, sweatshirt | Essential Oversized Tee, Relaxed Oxford Shirt |
| Bottoms      | Trousers, denim, shorts, cargo   | Structured Wide Trousers, Straight Denim      |
| Outerwear    | Jacket, blazer, coat, cardigan   | Utility Jacket, Tailored Blazer               |
| Footwear     | Sneakers, loafers, boots         | Minimal Leather Sneaker                       |
| Accessories  | Bag, belt, wallet, cap           | Everyday Leather Tote, Leather Belt           |

## 2.3 Collection strategy

| **Collection** | **Peran**                                 | **Aturan katalog**                                 |
|----------------|-------------------------------------------|----------------------------------------------------|
| Essentials     | Produk inti dan always-on                 | Restock terencana, varian dasar, mudah ditemukan   |
| Form           | Siluet dan konstruksi lebih eksperimental | Kurasi per drop/season, konten editorial           |
| Atelier        | Item eksklusif atau limited               | Kuantitas terbatas, aturan drop dan restock khusus |
| Movement       | Produk urban dan fungsional               | Fokus aktivitas harian dan material praktis        |

## 2.4 Product data standard

- Product: nama, slug, deskripsi, material, fit, care instruction, kategori, collection, status publikasi, SEO metadata.

- Variant: SKU, size, color, harga, compare-at price, berat, dimensi paket, status aktif.

- Media: foto utama, gallery, swatch, video opsional, alt text, urutan tampilan.

- Sizing: tabel ukuran berdasarkan kategori produk; definisi measurement harus konsisten.

- 3D metadata: asset version, preview, format, ukuran file, material slots, kompatibilitas variant, status validasi.

- Commercial data: harga dalam integer minor currency unit atau numeric IDR tanpa floating point; diskon dan pajak dicatat secara eksplisit.

## 2.5 Contoh katalog awal

| **SKU contoh** | **Produk**              | **Kategori** | **Varian contoh**    | **Harga simulasi** |
|----------------|-------------------------|--------------|----------------------|--------------------|
| ARV-TOP-001    | Essential Oversized Tee | Tops         | Black/Ivory; S-XL    | Rp299.000          |
| ARV-TOP-002    | Relaxed Oxford Shirt    | Tops         | White/Sky; S-XL      | Rp499.000          |
| ARV-BOT-001    | Structured Trousers     | Bottoms      | Black/Stone; 28-34   | Rp649.000          |
| ARV-OUT-001    | Utility Overshirt       | Outerwear    | Charcoal/Olive; S-XL | Rp899.000          |
| ARV-FW-001     | Minimal Leather Sneaker | Footwear     | White/Black; 39-44   | Rp1.299.000        |
| ARV-ACC-001    | Everyday Tote           | Accessories  | Black/Tan; One Size  | Rp799.000          |

Semua nama SKU dan harga dalam bagian ini merupakan data simulasi untuk pengembangan, bukan penawaran komersial yang sudah diputuskan.

# 3. Target Pengguna dan Customer Journey

## 3.1 Persona

| **Persona**                 | **Kebutuhan**                                          | **Fitur utama**                                       |
|-----------------------------|--------------------------------------------------------|-------------------------------------------------------|
| Fashion customer            | Mencari produk, membandingkan ukuran/warna, checkout   | Search, filters, product page, size guide, cart       |
| Content/merchandising staff | Menerbitkan produk dan collection dengan media lengkap | Catalog CMS, asset manager, preview, publish workflow |
| Inventory/operations staff  | Menjaga stok dan memproses fulfillment                 | Stock ledger, reservations, order queue, shipment     |
| Owner/store manager         | Memantau penjualan dan mengatur operasional            | Dashboard, analytics, access control, audit logs      |
| Customer support            | Menangani pertanyaan, pembatalan, retur                | Customer profile, order lookup, returns, notes        |

## 3.2 Customer journey

| **Tahap**     | **Aksi pelanggan**                     | **Respons sistem**                              | **Risiko UX**                            |
|---------------|----------------------------------------|-------------------------------------------------|------------------------------------------|
| Discover      | Membuka homepage atau campaign         | Render konten utama cepat dan SEO-friendly      | Hero berat, navigasi tidak jelas         |
| Explore       | Membuka shop, kategori, filter         | Mengembalikan katalog dan facet filter          | Filter reset, hasil kosong membingungkan |
| Evaluate      | Membuka detail produk dan 3D           | Menampilkan harga, varian, gambar, model 3D     | Model gagal atau detail ukuran kurang    |
| Select        | Memilih warna, ukuran, jumlah          | Validasi varian dan stok                        | Variant tidak tersedia                   |
| Cart          | Menambahkan ke cart                    | Simpan cart dan hitung ulang harga              | Harga/stok berubah                       |
| Checkout      | Memilih alamat, layanan kirim, payment | Buat order, reserve stock, buat payment session | Network timeout, payment pending         |
| Fulfillment   | Menunggu pesanan                       | Status order, shipment, tracking                | Status terlambat diperbarui              |
| Post-purchase | Menerima barang, review/retur          | Review, return request, support                 | Proses retur tidak transparan            |

## 3.3 User story inti

- Sebagai pelanggan, saya ingin mencari produk berdasarkan kategori, ukuran, warna, dan rentang harga.

- Sebagai pelanggan, saya ingin melihat model produk 3D dan kembali ke foto biasa kapan saja.

- Sebagai pelanggan, saya ingin mengetahui size guide dan ketersediaan SKU sebelum menambahkan ke cart.

- Sebagai pelanggan, saya ingin membayar melalui metode pembayaran yang tersedia dan melihat status order.

- Sebagai product manager, saya ingin menerbitkan produk setelah seluruh data, stok, media, dan aset valid.

- Sebagai inventory staff, saya ingin mencatat penerimaan, penyesuaian, reservasi, dan pengeluaran stok.

- Sebagai owner, saya ingin melihat penjualan berdasarkan periode, produk, dan status transaksi.

# 4. Product Requirements Document

## 4.1 Prioritas requirement

| **ID** | **Requirement**                           | **Prioritas** | **Acceptance summary**                              |
|--------|-------------------------------------------|---------------|-----------------------------------------------------|
| FR-001 | Registrasi, login, logout, reset password | P0            | Session aman dan tervalidasi                        |
| FR-002 | Product catalog dan category listing      | P0            | Produk aktif tampil dengan pagination               |
| FR-003 | Product variants dan SKU                  | P0            | Pilihan warna/ukuran mengarah ke variant yang benar |
| FR-004 | Search, sort, filters                     | P0            | Hasil konsisten dengan query dan filter             |
| FR-005 | Cart guest dan authenticated              | P0            | Cart merge dan harga dihitung ulang server          |
| FR-006 | Checkout quote                            | P0            | Subtotal, diskon, shipping, total transparan        |
| FR-007 | Order dan payment integration             | P0            | Webhook tervalidasi dan idempotent                  |
| FR-008 | Inventory reservation                     | P0            | Mencegah overselling                                |
| FR-009 | Admin product/order/inventory             | P0            | Aksi mengikuti RBAC dan audit                       |
| FR-010 | Customer order history                    | P0            | Pelanggan hanya melihat order miliknya              |
| FR-011 | 3D product viewer                         | P1            | Fallback image dan progressive loading tersedia     |
| FR-012 | Color/material presets                    | P1            | Opsi berasal dari konfigurasi server                |
| FR-013 | Virtual showroom                          | P1            | Area dan hotspot dapat dijelajahi                   |
| FR-014 | Outfit Studio                             | P1            | Outfit disusun dari item yang kompatibel            |
| FR-015 | CMS lookbook/journal                      | P1            | Draft, preview, publish, archive                    |
| FR-016 | Wishlist dan review                       | P1            | Ownership dan moderation berjalan                   |
| FR-017 | Return/refund workflow                    | P1            | Status, alasan, item, dan refund terlacak           |
| FR-018 | Analytics lanjutan                        | P2            | Definisi metrik konsisten                           |
| FR-019 | Recommendation engine                     | P2            | Opt-in, explainable rules, privacy-aware            |
| FR-020 | Multi-warehouse routing                   | P2            | Aturan lokasi dan stok disepakati                   |

## 4.2 Functional requirements detail

### Catalog and discovery

- Daftar produk hanya memuat status PUBLISHED dan visibility aktif.

- Filter minimal: category, collection, size, color, min/max price, availability.

- Sorting minimal: newest, price ascending, price descending, featured.

- Search mendukung nama, SKU, kategori, dan deskripsi yang relevan.

- Product detail menampilkan material, fit, care, size guide, gallery, variant selector, stock hint, dan related items.

### Cart and checkout

- Guest cart dapat disimpan melalui anonymous cart identifier yang aman.

- Saat login, guest cart digabung dengan cart akun memakai aturan quantity dan availability yang eksplisit.

- Server menghitung ulang harga, diskon, shipping, pajak bila berlaku, dan total ketika checkout quote dibuat.

- Cart tidak menjamin stok. Stok dijamin ketika reservation berhasil.

- Checkout menghasilkan order yang memiliki snapshot alamat, item, harga, dan ringkasan perhitungan.

### Order and returns

- Order state berubah melalui command yang tervalidasi, bukan update bebas dari client.

- Pembatalan setelah paid mengikuti kebijakan refund dan tahap fulfillment.

- Return request terikat ke order item dan kuantitas yang dibeli.

- Refund mencatat provider reference, nominal, alasan, waktu, dan hasil gateway.

## 4.3 Non-functional requirements

| **Area**        | **Baseline target**                                                   | **Cara verifikasi**               |
|-----------------|-----------------------------------------------------------------------|-----------------------------------|
| Performance web | Core Web Vitals sehat; halaman katalog tidak menunggu 3D              | Lighthouse dan real-user metrics  |
| 3D load         | Poster muncul sebelum GLB selesai; model lazy-load                    | Network trace dan perangkat nyata |
| Reliability     | Target awal availability 99,5% untuk API inti                         | Uptime monitoring                 |
| API             | P95 latency target ditetapkan per endpoint setelah baseline load test | k6/APM                            |
| Accessibility   | Keyboard support, focus visible, alt text, contrast                   | axe-core + manual audit           |
| Security        | OWASP ASVS 5.0 sebagai verification baseline                          | SAST, DAST, pentest               |
| Data integrity  | Tidak ada oversell dan payment double-apply                           | Concurrency/integration tests     |
| Responsive      | Mobile-first, tablet, desktop                                         | Playwright viewport matrix        |

# 5. Business Process dan Aturan Operasional

## 5.1 Product lifecycle

DRAFT → REVIEW → READY_TO_PUBLISH → PUBLISHED → ARCHIVED

- Produk baru wajib memiliki nama, slug, kategori, deskripsi, harga minimal, dan setidaknya satu variant aktif.

- Produk dengan aset 3D wajib melewati validasi file, preview, material slots, dan mobile profile sebelum badge 3D diaktifkan.

- Produk dapat dipublikasikan tanpa 3D; gambar tetap wajib.

- Perubahan harga dicatat dengan actor, timestamp, old value, dan new value.

## 5.2 Inventory lifecycle

RECEIPT → AVAILABLE → RESERVED → COMMITTED/RELEASED → AVAILABLE

Gunakan inventory movement ledger sebagai jejak perubahan stok. Inventory level adalah ringkasan operasional, sedangkan movement mencatat alasan perubahan. Hindari mengubah angka stok tanpa ledger entry.

| **Movement type** | **Efek**                              | **Contoh alasan**                     |
|-------------------|---------------------------------------|---------------------------------------|
| RECEIPT           | On-hand bertambah                     | Barang masuk dari supplier            |
| RESERVATION       | Reserved bertambah                    | Checkout berhasil membuat reservation |
| RELEASE           | Reserved berkurang                    | Payment expired atau order dibatalkan |
| COMMIT/SALE       | On-hand dan reserved berkurang        | Order dibayar dan stok dikonfirmasi   |
| ADJUSTMENT        | On-hand disesuaikan                   | Stock opname, rusak, hilang           |
| RETURN_TO_STOCK   | On-hand bertambah jika lolos inspeksi | Barang retur layak jual               |

## 5.3 Order state machine

PENDING_PAYMENT → PAID → PROCESSING → READY_TO_SHIP → SHIPPED → DELIVERED → COMPLETED

PENDING_PAYMENT → EXPIRED / CANCELLED

PAID → REFUND_PENDING → PARTIALLY_REFUNDED / REFUNDED

DELIVERED → RETURN_REQUESTED → RETURN_APPROVED → RETURNED

Status di atas merupakan baseline. Implementasi final harus mendefinisikan allowed transitions, actor yang berwenang, timeout, dan efek samping untuk setiap transisi. Payment, order, shipment, return, dan refund merupakan state machine terpisah.

## 5.4 Checkout workflow

- Client mengirim cart item IDs, alamat, shipping service, coupon code, dan idempotency key.

- Backend mengambil ulang harga dan status aktif setiap variant dari database.

- Backend menghitung subtotal, diskon, shipping quote, pajak jika berlaku, dan grand total.

- Backend melakukan reservasi stok atomik dengan masa berlaku.

- Backend membuat order dan order item snapshot dalam database transaction.

- Backend membuat payment session melalui provider adapter.

- Jika pembuatan payment session gagal, order tetap tercatat dengan payment attempt gagal; sistem melepas reservasi sesuai aturan yang ditentukan.

- Webhook mengubah payment dan order melalui proses idempotent.

## 5.5 Return and refund workflow

- Pelanggan mengajukan retur dalam batas waktu kebijakan.

- Support memeriksa order, item, kuantitas, alasan, dan bukti.

- Admin menyetujui/menolak dengan alasan tercatat.

- Barang diterima dan diperiksa sebelum stok dikembalikan.

- Refund diproses melalui provider atau prosedur manual terkontrol.

- Semua status dan perubahan nominal tercatat di audit log.

# 6. Sitemap, UX, dan Design System

## 6.1 Sitemap storefront

Storefront

├── Home

├── Shop

│ ├── All Products

│ ├── Category \[slug\]

│ └── Search

├── Collections \[slug\]

├── Product \[slug\]

├── Experience

│ ├── Virtual Showroom

│ └── Outfit Studio

├── Lookbook \[slug\]

├── Journal \[slug\]

├── About / Contact

├── Cart / Checkout

└── Account

├── Profile / Addresses

├── Orders \[orderNumber\]

├── Wishlist

└── Returns

## 6.2 Sitemap admin

Admin

├── Overview

├── Catalog: Products, Variants, Categories, Collections, Media, 3D Assets

├── Inventory: Warehouses, Stock Levels, Movements, Reservations

├── Commerce: Orders, Payments, Shipments, Returns, Refunds, Coupons

├── Customers: Directory, Profiles, Reviews, Support Notes

├── Content: Homepage, Lookbook, Journal, Campaigns

├── Analytics: Sales, Products, Customers, 3D Engagement

└── Settings: Users, Roles, Providers, Shipping, Store, Audit Logs

## 6.3 Visual direction

| **Token**   | **Nilai awal** | **Penggunaan**                     |
|-------------|----------------|------------------------------------|
| Charcoal    | \#17191B       | Header, footer, typography kuat    |
| Graphite    | \#35383A       | Surface sekunder, menu gelap       |
| Cream       | \#E9E4DA       | Panel editorial dan section terang |
| Ivory       | \#F8F7F3       | Background utama                   |
| Stone       | \#8B897F       | Metadata dan teks sekunder         |
| Accent blue | \#1F4E79       | Link dan status fokus terbatas     |
| Success     | \#416B59       | Status berhasil                    |
| Danger      | \#9C3D3D       | Status error atau destructive      |

## 6.4 Typography and components

- Gunakan pasangan editorial serif untuk headline campaign dan sans-serif untuk interface.

- Navigation ringkas dengan Shop, Collections, Showroom, Journal, About, Search, Account, dan Bag.

- Product card menampilkan gambar, nama, harga, warna tersedia, dan quick action seperlunya.

- 3D viewer menyediakan kontrol eksplisit: rotate, zoom, reset view, color, view mode, dan fallback.

- Semua komponen menyediakan loading, empty, error, disabled, focus, hover, dan success states.

- Gerakan UI harus singkat dan memiliki reduced-motion alternative.

## 6.5 Page-level acceptance

| **Page**       | **Wajib tampil**                                   | **State khusus**                    |
|----------------|----------------------------------------------------|-------------------------------------|
| Home           | Campaign, featured collection, new arrivals, story | Skeleton campaign, image failure    |
| Shop           | Grid, filter, sorting, pagination                  | No results, loading, API error      |
| Product detail | Gallery, price, variant, size guide, stock, CTA    | Variant unavailable, 3D fail        |
| Showroom       | Scene, zone navigation, hotspots                   | WebGL unsupported, asset pending    |
| Outfit Studio  | Avatar, item slots, saved outfit                   | Incompatible garment, missing asset |
| Cart           | Line items, totals, remove/update                  | Price/stock changed                 |
| Checkout       | Address, shipping, payment, summary                | Quote expired, payment pending      |
| Admin orders   | Search, filters, status timeline, actions          | Unauthorized, action conflict       |

# 7. System Architecture dan Technology Decisions

## 7.1 Architectural style

Gunakan modular monolith dengan empat deployable applications: storefront, admin, API, dan worker. Modul domain berada dalam satu backend NestJS dan saling berinteraksi melalui application services serta domain events. Pecah menjadi microservices hanya setelah ada bukti kebutuhan scaling, isolasi deployment, atau ownership tim.

Customer/Admin Browser → CDN/WAF → Next.js Storefront + Admin → NestJS REST API → Domain Modules → PostgreSQL / Redis / Object Storage → BullMQ Worker → Payment, Shipping, Email Providers

## 7.2 Stack recommendation

| **Layer**        | **Pilihan baseline**                           | **Catatan implementasi**                                                           |
|------------------|------------------------------------------------|------------------------------------------------------------------------------------|
| Runtime          | Node.js LTS yang kompatibel                    | Gunakan versi LTS dan lockfile                                                     |
| Monorepo         | pnpm workspace + Turborepo                     | Shared packages hanya untuk kebutuhan nyata                                        |
| Storefront/Admin | Next.js 16 App Router + React 19 + TypeScript  | Server Components untuk konten; client islands untuk interaksi                     |
| UI               | Tailwind CSS + accessible component primitives | Design tokens terpusat                                                             |
| 3D               | Three.js + React Three Fiber 9 + Drei          | R3F 9 dipasangkan dengan React 19                                                  |
| Backend          | NestJS 12                                      | Modul domain dan DTO validation                                                    |
| Database         | PostgreSQL 18.x                                | Gunakan minor patch yang didukung                                                  |
| ORM              | Prisma ORM stable GA                           | Verifikasi status major dan adapter ketika kickoff; jangan pin RC untuk production |
| Cache/Queue      | Redis 8.x + BullMQ                             | Pilih release train dengan support horizon yang sesuai                             |
| Storage          | S3-compatible object storage + CDN             | Private upload, signed URL, lifecycle policy                                       |
| Payments         | Midtrans adapter                               | Provider pertama; sandbox sebelum production                                       |
| Testing          | Vitest/Jest, Supertest, Playwright, k6         | Sesuaikan toolchain dengan versi runtime                                           |

| **Versioning note** Per 14 November 2026, dokumentasi resmi menunjukkan Next.js 16, NestJS 12, PostgreSQL 18.x, dan React Three Fiber 9 untuk React 19. Prisma 8 memiliki informasi status rilis yang berubah pada halaman dokumentasinya; blueprint ini mengharuskan verifikasi stable release dan compatibility saat kickoff sebelum mengunci versi. |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## 7.3 Rendering boundaries

| **Route family**              | **Rendering approach**                 | **Alasan**                                         |
|-------------------------------|----------------------------------------|----------------------------------------------------|
| Homepage / Journal / Lookbook | Server-first, cached content           | SEO dan first load                                 |
| Product catalog               | Server render + client filters         | Indexable content dan interaksi filter             |
| Product detail                | Server product data + client 3D viewer | Konten utama tidak menunggu WebGL                  |
| Showroom / Outfit Studio      | Client-side 3D scene                   | Canvas, renderer, pointer/touch interaction        |
| Cart / Checkout               | Dynamic authenticated/session data     | Harga, stok, alamat, dan payment session real-time |
| Account / Admin               | Authenticated dynamic routes           | Data privat dan role enforcement                   |

## 7.4 Cross-cutting concerns

- Contracts: OpenAPI schema dan shared API types; jangan import backend internals ke browser.

- Validation: request DTO di API; schema shared hanya untuk format netral.

- Error handling: standard error envelope, correlation ID, domain error code.

- Caching: cache konten/katalog yang aman; jangan cache cart, checkout total, atau status payment secara publik.

- Observability: structured logs, traces, metrics, Sentry.

- Security: authn/authz, CSRF/CORS policy, secrets, file validation.

# 8. Monorepo dan Struktur Aplikasi

## 8.1 Repository tree

arven/

├── apps/

│ ├── storefront/ \# Next.js customer site

│ ├── admin/ \# Next.js operations dashboard

│ ├── api/ \# NestJS REST API

│ └── worker/ \# BullMQ processors

├── packages/

│ ├── database/ \# Prisma schema, migrations, seeds

│ ├── contracts/ \# API DTO types / OpenAPI artifacts

│ ├── ui/ \# Shared accessible components

│ ├── three-engine/ \# Reusable 3D scenes and loaders

│ ├── validators/ \# Shared input schemas

│ ├── config/ \# ESLint, TS, Tailwind config

│ └── observability/ \# Logger and tracing wrappers

├── infrastructure/

│ ├── docker/

│ ├── scripts/

│ └── deployment/

├── docs/ \# PRD, ADR, API, data, security

├── docker-compose.yml

├── pnpm-workspace.yaml

├── turbo.json

└── package.json

## 8.2 Responsibility boundaries

| **Package/app** | **Boleh memiliki**                                 | **Tidak boleh menjadi**                      |
|-----------------|----------------------------------------------------|----------------------------------------------|
| storefront      | Page composition, SEO, customer UI, local UI state | Sumber kebenaran harga/stok/payment          |
| admin           | Operational screens, forms, filters                | Tempat bypass business rules                 |
| api             | Domain services, authorization, transactions       | Monolith tanpa boundary dan controller gemuk |
| worker          | Retryable asynchronous handlers                    | Sumber kebenaran transaksi tunggal           |
| database        | Schema, migrations, seed, repository adapters      | Tempat menyimpan business workflow           |
| contracts       | HTTP DTO/schema dan generated API spec             | Copy internal Prisma entities ke frontend    |
| three-engine    | Renderer, loaders, scene components                | Akses langsung database atau payment         |

## 8.3 Naming and code conventions

- Folder dan file menggunakan kebab-case; class/type menggunakan PascalCase; variable/function menggunakan camelCase.

- Domain event menggunakan dot.case dan versi payload bila perlu.

- API menggunakan plural nouns, resource IDs, pagination, dan version prefix.

- Semua nominal menggunakan integer rupiah atau tipe Decimal/Numeric; hindari floating-point untuk uang.

- Tanggal disimpan UTC; tampilan dikonversi ke timezone pengguna/operasional.

# 9. Backend Domain Architecture

| **Module**            | **Tanggung jawab**                     | **Key operations**                     |
|-----------------------|----------------------------------------|----------------------------------------|
| Auth                  | Login, session, password reset, MFA    | register, login, refresh, revoke       |
| Users / Roles         | Profil, role, permission               | assign role, ownership checks          |
| Catalog               | Produk, variant, media, slug           | create, update, publish, archive       |
| Collections           | Collection dan merchandising           | order items, scheduling                |
| Pricing / Promotions  | Harga, coupons, discount rules         | quote, validate, redeem                |
| Inventory             | Stock ledger, level, reservation       | receive, reserve, release, commit      |
| Cart                  | Cart guest/user dan cart items         | add, merge, update, remove             |
| Checkout              | Quote dan order creation orchestration | validate, price, reserve, create order |
| Orders                | State machine dan order snapshots      | transition, cancel, complete           |
| Payments              | Provider adapter dan webhook           | create session, verify, refund         |
| Shipping              | Rate quote, label, tracking            | quote, dispatch, sync events           |
| Returns               | Return request dan inspection          | approve, reject, restock, refund       |
| Reviews               | Rating, moderation                     | create, hide, approve                  |
| Media / 3D Assets     | Upload, validation, metadata, versions | presign, validate, publish             |
| CMS                   | Homepage, journal, lookbook            | draft, preview, publish                |
| Analytics             | Aggregation dan reporting              | daily sales, funnel metrics            |
| Audit / Notifications | Audit log, email, in-app events        | write audit, notify                    |

## 9.1 NestJS module pattern

catalog/

├── application/

│ ├── commands/

│ ├── queries/

│ └── services/

├── domain/

│ ├── entities/

│ ├── value-objects/

│ └── events/

├── infrastructure/

│ └── prisma-catalog.repository.ts

├── presentation/

│ ├── catalog.controller.ts

│ └── dto/

└── catalog.module.ts

Pola ini merupakan panduan, bukan kewajiban untuk setiap modul sederhana. Terapkan domain layer yang lebih eksplisit pada inventory, checkout, payment, order, dan returns karena modul tersebut memiliki aturan transaksi kritis.

## 9.2 Dependency rules

- Presentation layer memanggil application service.

- Application service mengatur use case dan transaction boundary.

- Domain layer tidak mengimpor NestJS, Prisma, atau HTTP types.

- Infrastructure mengimplementasikan repository dan provider adapter.

- Modul lain berkomunikasi melalui public service interface atau domain event, bukan mengakses tabel internal secara sembarang.

# 10. Database Architecture dan Data Dictionary

## 10.1 Database schemas/logical domains

| **Domain** | **Tabel utama**                                                                                             |
|------------|-------------------------------------------------------------------------------------------------------------|
| Identity   | users, sessions, roles, permissions, user_roles, addresses                                                  |
| Catalog    | products, categories, product_categories, collections, collection_products, product_variants, product_media |
| 3D         | product_3d_assets, asset_validation_runs, customization_presets, outfit_scenes                              |
| Inventory  | warehouses, inventory_levels, inventory_movements, stock_reservations                                       |
| Commerce   | carts, cart_items, orders, order_items, order_status_history                                                |
| Payment    | payments, payment_events, refunds                                                                           |
| Shipping   | shipments, shipment_events                                                                                  |
| Promotion  | coupons, coupon_redemptions                                                                                 |
| Customer   | wishlists, wishlist_items, reviews, returns, return_items                                                   |
| CMS        | pages, journal_articles, lookbooks, media_assets                                                            |
| Platform   | audit_logs, outbox_events, idempotency_records                                                              |

## 10.2 Core entity specification

| **Entity**        | **Field penting**                                                                             | **Constraint / notes**                                       |
|-------------------|-----------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| User              | id UUID, email, password_hash, full_name, phone, status, verified_at                          | Email normalized unique; hash password only                  |
| Product           | id, slug, name, description, material, fit, status, base metadata                             | Slug unique; active/published gate                           |
| ProductVariant    | id, product_id, sku, size, color, price, weight, active                                       | SKU unique; price \>= 0                                      |
| Category          | id, parent_id, slug, name, sort_order                                                         | Tree relation; slug unique                                   |
| Collection        | id, slug, name, description, status, starts_at, ends_at                                       | Publication window validation                                |
| ProductMedia      | id, product_id, variant_id nullable, type, URL, alt_text, position                            | Do not store binary file in PostgreSQL                       |
| Product3DAsset    | id, product_id, variant_id nullable, object_key, format, version, status, bytes, config JSONB | Versioned; validated before READY                            |
| InventoryLevel    | warehouse_id, variant_id, on_hand, reserved, updated_at                                       | Unique warehouse+variant; nonnegative check                  |
| InventoryMovement | id, variant_id, warehouse_id, type, quantity_delta, reference, actor_id, created_at           | Append-only ledger                                           |
| StockReservation  | id, order_id, variant_id, warehouse_id, quantity, status, expires_at                          | Idempotent reference; expiry worker                          |
| Cart              | id, user_id nullable, guest_token_hash nullable, currency, updated_at                         | Guest identity stored securely                               |
| CartItem          | id, cart_id, variant_id, quantity, configuration JSONB                                        | Unique cart+variant+config rule as defined                   |
| Order             | id, number, user_id, status, currency, totals, address_snapshot JSONB                         | Immutable snapshot for financial fields after paid           |
| OrderItem         | id, order_id, variant_id nullable, SKU/name/size/color snapshots, qty, price                  | FK may be nullable for catalog deletion; snapshots preserved |
| Payment           | id, order_id, provider, provider_reference, status, amount, currency                          | Reference and provider state indexed                         |
| PaymentEvent      | id, payment_id, provider_event_id, event_type, payload JSONB, processed_at                    | Unique provider event key                                    |
| Shipment          | id, order_id, provider, service, tracking_number, status                                      | Provider reference indexed                                   |
| AuditLog          | id, actor_id, action, resource, resource_id, before/after JSONB, ip, created_at               | Append-only; minimize sensitive payloads                     |

## 10.3 Entity relationships

USER 1---N ADDRESS

USER 1---N ORDER / CART / REVIEW / WISHLIST

PRODUCT N---N CATEGORY via PRODUCT_CATEGORY

PRODUCT 1---N VARIANT / MEDIA / 3D_ASSET

COLLECTION N---N PRODUCT via COLLECTION_PRODUCT

VARIANT 1---N INVENTORY_LEVEL / MOVEMENT / RESERVATION

CART 1---N CART_ITEM; CART_ITEM N---1 VARIANT

ORDER 1---N ORDER_ITEM / PAYMENT / SHIPMENT / STATUS_HISTORY

PAYMENT 1---N PAYMENT_EVENT; ORDER 1---N REFUND

RETURN 1---N RETURN_ITEM

## 10.4 Constraints and indexes

- Unique: user email, product slug, category slug, collection slug, SKU, order number, provider event key.

- Composite unique: inventory_levels(warehouse_id, variant_id); collection_products(collection_id, product_id).

- Check: quantity \> 0; price \>= 0; on_hand \>= 0; reserved \>= 0; reserved \<= on_hand.

- Indexes: product status/category, variant product_id, order user_id+created_at, order status+created_at, payment reference, shipment tracking, reservation expires_at.

- Use GIN JSONB index hanya untuk key yang benar-benar dipakai filter/query.

- Gunakan database transaction dan row-level locking atau atomic conditional update untuk stok.

- Soft delete untuk katalog/CMS jika diperlukan; jangan hard delete order/payment ledger.

## 10.5 Monetary and temporal rules

- Simpan nominal IDR dalam integer rupiah atau NUMERIC(18,2); jangan memakai Float/Double untuk uang.

- Simpan currency ISO 4217, misalnya IDR.

- Simpan timestamps UTC dengan timezone-aware type.

- Snapshot unit price, tax, discount allocation, shipping cost, dan address pada saat order dibuat.

- Definisikan pembulatan diskon dan pajak secara konsisten sebelum implementasi.

## 10.6 Recommended enums

| **Enum**              | **Values baseline**                                                                                 |
|-----------------------|-----------------------------------------------------------------------------------------------------|
| ProductStatus         | DRAFT, REVIEW, PUBLISHED, ARCHIVED                                                                  |
| UserStatus            | ACTIVE, SUSPENDED, PENDING_VERIFICATION                                                             |
| OrderStatus           | PENDING_PAYMENT, PAID, PROCESSING, READY_TO_SHIP, SHIPPED, DELIVERED, COMPLETED, CANCELLED, EXPIRED |
| PaymentStatus         | PENDING, AUTHORIZED, SETTLEMENT, FAILED, EXPIRED, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED      |
| InventoryMovementType | RECEIPT, RESERVATION, RELEASE, SALE, ADJUSTMENT, RETURN_TO_STOCK                                    |
| AssetStatus           | UPLOADED, PROCESSING, READY, FAILED, ARCHIVED                                                       |
| ShipmentStatus        | UNFULFILLED, READY_TO_SHIP, IN_TRANSIT, DELIVERED, FAILED, RETURNED                                 |
| ReturnStatus          | REQUESTED, UNDER_REVIEW, APPROVED, REJECTED, RECEIVED, REFUNDED, CLOSED                             |

# 11. API Specification dan Contract

## 11.1 API conventions

- Base path: /api/v1.

- JSON request/response; UTF-8.

- Authentication: secure session cookie untuk browser; token hanya bila ada client use case yang jelas.

- Pagination: page/limit untuk admin sederhana; cursor pagination untuk feed besar.

- Filtering dan sorting memakai allowlist field.

- Semua request mutasi kritis menerima Idempotency-Key.

- Setiap response memiliki requestId/correlationId untuk troubleshooting.

## 11.2 Endpoint catalog

| **Domain**      | **Method + route**                                                                    | **Akses**                     |
|-----------------|---------------------------------------------------------------------------------------|-------------------------------|
| Auth            | POST /auth/register, /auth/login, /auth/logout, /auth/refresh                         | Public / self                 |
| Auth            | POST /auth/forgot-password, /auth/reset-password, /auth/verify-email                  | Public, token-limited         |
| User            | GET/PATCH /users/me; GET/POST /users/me/addresses                                     | Self                          |
| Catalog         | GET /products; GET /products/:slug; GET /categories; GET /collections                 | Public                        |
| 3D              | GET /products/:id/3d-assets; GET /3d-assets/:id/metadata                              | Public for published asset    |
| Cart            | GET /cart; POST /cart/items; PATCH/DELETE /cart/items/:id                             | Guest/user                    |
| Checkout        | POST /checkout/quote; POST /checkout/orders                                           | Guest/user with valid session |
| Orders          | GET /orders; GET /orders/:orderNumber; POST /orders/:id/cancel                        | Owner/support                 |
| Payments        | POST /payments/:orderId/session; GET /payments/:id; POST /payments/webhooks/:provider | Owner/provider                |
| Returns         | POST /orders/:id/returns; GET /returns/:id                                            | Owner/support                 |
| Admin catalog   | CRUD /admin/products, /admin/categories, /admin/collections                           | Catalog permission            |
| Admin inventory | GET/POST /admin/inventory/\*; POST /admin/stock-movements                             | Inventory permission          |
| Admin commerce  | GET/PATCH /admin/orders/:id; POST shipment/return/refund actions                      | Order/finance permission      |
| Admin platform  | GET /admin/analytics/\*; GET /admin/audit-logs; CRUD /admin/roles                     | Specific permission           |

## 11.3 Response envelope

{

"success": true,

"data": { "id": "...", "status": "..." },

"meta": { "requestId": "...", "page": 1, "limit": 20 }

}

Error example:

{

"success": false,

"error": {

"code": "VARIANT_OUT_OF_STOCK",

"message": "Varian tidak tersedia.",

"details": \[\]

},

"meta": { "requestId": "..." }

}

## 11.4 Example create order request

{

"addressId": "uuid",

"shipping": { "provider": "provider-code", "service": "service-code" },

"couponCode": "WELCOME10",

"items": \[

{ "variantId": "uuid", "quantity": 1,

"customization": { "colorPresetId": "uuid" } }

\]

}

Client tidak boleh mengirim unit price, grand total, available stock, atau payment status sebagai sumber kebenaran. Backend mengambil data dari database dan provider.

## 11.5 HTTP status mapping

| **Status** | **Penggunaan**                                                    |
|------------|-------------------------------------------------------------------|
| 200        | Read atau update berhasil                                         |
| 201        | Resource berhasil dibuat                                          |
| 204        | Delete/aksi tanpa response body                                   |
| 400        | Payload atau business input invalid                               |
| 401        | Belum autentikasi                                                 |
| 403        | Tidak memiliki permission                                         |
| 404        | Resource tidak ditemukan atau disembunyikan sesuai policy         |
| 409        | Conflict, duplicate request, stock race, invalid state transition |
| 422        | Business validation gagal                                         |
| 429        | Rate limit                                                        |
| 500/503    | Internal/provider/service unavailable                             |

# 12. Checkout, Inventory, dan Payment Transactions

## 12.1 Inventory reservation algorithm

UPDATE inventory_levels

SET quantity_reserved = quantity_reserved + :qty

WHERE warehouse_id = :warehouse_id AND variant_id = :variant_id

AND quantity_on_hand - quantity_reserved \>= :qty;

-- Require one affected row. Insert reservation, order snapshot, and outbox

-- event in the same database transaction, then commit.

Jika conditional update tidak memengaruhi satu baris, hentikan transaksi dan kembalikan konflik stok. Untuk beberapa varian dalam satu order, urutkan lock/update berdasarkan variant ID agar risiko deadlock berkurang. Terapkan transaction timeout dan retry terbatas untuk deadlock yang aman diulang.

## 12.2 Payment workflow

1\. Checkout creates PENDING_PAYMENT order and stock reservation.

2\. API requests payment session using provider adapter.

3\. Customer pays on provider-hosted/approved payment flow.

4\. Provider sends webhook to API.

5\. API verifies signature and/or queries provider status.

6\. Persist notification event with deduplication key.

7\. Apply payment transition in database transaction.

8\. Confirm/commit stock and emit outbox event.

9\. Worker sends confirmation and starts fulfillment task.

## 12.3 Idempotency

- Simpan idempotency key, actor, route/operation, request hash, response reference, dan expiry.

- Key yang sama dengan payload sama mengembalikan hasil operasi sebelumnya.

- Key sama dengan payload berbeda menghasilkan conflict.

- Provider event ID atau stable event fingerprint harus unique.

- Webhook dapat dikirim berulang; handler tidak boleh menggandakan order, reservation, atau refund.

## 12.4 Failure handling

| **Failure**                                 | **Penanganan**                                                             |
|---------------------------------------------|----------------------------------------------------------------------------|
| Payment session creation fails              | Simpan failed attempt; order/reservation mengikuti retry policy dan expiry |
| Webhook delayed                             | Poll status provider secara terkontrol; jangan percaya browser redirect    |
| Duplicate webhook                           | Return success setelah deduplication dan status check                      |
| Gateway paid but DB temporarily unavailable | Persist/retry notification; reconciliation worker memeriksa mismatch       |
| Reservation expires before payment          | Tandai expired/release; payment late success masuk exception workflow      |
| Shipping provider unavailable               | Simpan order paid; retry rate/label/tracking tanpa mengubah payment        |

## 12.5 Reconciliation

Buat job berkala untuk membandingkan payment status di database dengan status gateway untuk transaksi yang masih pending atau mismatch. Catat hasil rekonsiliasi dan jalankan koreksi melalui service resmi yang memiliki audit trail. Hindari update manual langsung ke tabel.

# 13. 3D Experience dan Asset Pipeline

## 13.1 Experience scope

| **Experience**            | **Fungsi**                                                  | **Rilis**       |
|---------------------------|-------------------------------------------------------------|-----------------|
| 3D Product Viewer         | Orbit, zoom, reset, detail, switch view, color preset       | P1              |
| Material/Color Customizer | Pilihan material/color yang didukung per model              | P1              |
| Virtual Showroom          | Area, display, hotspot, navigasi, product card              | P1              |
| Outfit Studio             | Mannequin/avatar, garment slots, combine items, save outfit | P1              |
| Virtual fitting akurat    | Garment draping, body measurement, size recommendation      | Research/future |

## 13.2 Product viewer component model

\<ProductExperience assetManifest={manifest} poster={posterUrl} fallbackGallery={images}\>

\<CanvasBoundary\>

\<SceneEnvironment /\>\<ProductModel /\>\<CameraControls /\>

\<MaterialPresetController /\>\<LightingRig /\>

\</CanvasBoundary\>

\<AccessibleProductControls /\>

\</ProductExperience\>

## 13.3 GLB/GLTF pipeline

Pipeline: product tech pack → Blender modeling and topology cleanup → UV/material assignment → PBR texture baking → naming and coordinate validation → GLB export → geometry/material/texture validation → compression and quality variants → preview render and human visual QA → versioned upload to object storage → CDN distribution → admin publish.

## 13.4 Asset standards

| **Area**    | **Standard**                                                                      |
|-------------|-----------------------------------------------------------------------------------|
| Format      | GLB as default delivery; GLTF only when external assets are intentionally managed |
| Coordinate  | Document one up-axis, forward direction, scale unit, origin, and camera baseline  |
| Naming      | Stable names for meshes/materials, e.g. body_main, fabric_outer, stitching        |
| Geometry    | Remove hidden geometry, duplicate vertices, unnecessary modifiers                 |
| Texture     | PBR maps with documented color space and resolution                               |
| Compression | Evaluate Meshopt/Draco for geometry and KTX2/Basis for textures                   |
| LOD         | Create reduced detail profile for lower capability devices where justified        |
| Preview     | Generate poster image and optional turntable frames                               |
| Version     | Immutable object key per published version; metadata points to active version     |
| License     | Record ownership/source/license for each model, texture, HDRI, and font           |

## 13.5 Asset metadata example

{

"assetId": "uuid",

"productId": "uuid",

"version": 3,

"format": "glb",

"objectKey": "products/arv-top-001/v003/model.glb",

"posterKey": "products/arv-top-001/v003/poster.webp",

"bytes": 4200000,

"status": "READY",

"coordinateSystem": "documented-project-standard",

"materialSlots": \[

{ "mesh": "body_main", "material": "fabric_outer", "customizable": true }

\],

"qualityProfiles": { "desktop": "default", "mobile": "lite" }

}

## 13.6 Performance budgets

| **Metric** | **Initial budget**                                    | **Notes**                                    |
|------------|-------------------------------------------------------|----------------------------------------------|
| GLB size   | Target 2-8 MB per product model after optimization    | Complexity dependent, measure actual devices |
| Poster     | Load immediately from responsive image pipeline       | No dependency on WebGL                       |
| Viewer JS  | Split/lazy load 3D route and components               | Avoid shipping renderer on all routes        |
| Textures   | Prefer compressed GPU formats when supported          | Fallback/transcode path required             |
| Frame rate | Set device-tier targets and profile                   | Do not promise one FPS for every device      |
| Memory     | Dispose geometry, materials, textures, render targets | Test route transitions and repeated opens    |
| Showroom   | Lazy-load zones, baked lighting, occlusion/culling    | Avoid huge single scene payload              |

## 13.7 Fallback and accessibility

- WebGL unavailable: show static gallery, size details, and purchase actions.

- Asset failure: report telemetry and show fallback image; user can retry.

- Reduced motion: disable non-essential animation and auto-rotation.

- Keyboard: all customizer controls and scene exit actions remain keyboard accessible.

- Touch: gestures do not block page scroll outside the canvas.

- Context loss: attempt controlled recovery and preserve selected variant/configuration.

## 13.8 Outfit Studio constraints

Rilis awal menggunakan avatar mannequin dengan rig yang telah disepakati dan garment assets yang kompatibel. Setiap garment harus menyatakan avatar rig, skeleton version, slot, anchor, material slots, dan kompatibilitas. Sistem tidak boleh mengklaim ukuran badan atau fit akurat tanpa garment simulation dan validasi ukuran fisik. Outfit yang disimpan harus menyimpan product/variant IDs dan konfigurasi visual, bukan menjadi sumber kebenaran harga.

# 14. Admin Dashboard dan RBAC

## 14.1 Admin navigation

Overview

Catalog: Products, Variants, Categories, Collections, Media, 3D Assets

Inventory: Warehouses, Stock Levels, Movements, Reservations

Commerce: Orders, Payments, Shipments, Returns, Refunds, Coupons

Customers: Directory, Profiles, Reviews, Support Notes

Content: Homepage, Lookbook, Journal, Campaigns

Analytics: Sales, Products, Customers, 3D Engagement

Settings: Users, Roles, Providers, Shipping, Store, Audit Logs

## 14.2 Role and permission matrix

| **Permission area** | **Owner** | **Manager** | **Product** | **Inventory** | **Order** | **Content** | **Support** |
|---------------------|-----------|-------------|-------------|---------------|-----------|-------------|-------------|
| Sales analytics     | All       | Read        | None        | None          | Read      | None        | Limited     |
| Products            | All       | Edit        | Edit        | Read          | Read      | Read        | Read        |
| 3D assets           | All       | Edit        | Edit        | None          | None      | Read        | None        |
| Stock movements     | All       | Edit        | Read        | Edit          | Read      | None        | Read        |
| Orders              | All       | Edit        | Read        | Read          | Edit      | None        | Limited     |
| Refunds             | Approve   | Request     | None        | None          | Request   | None        | Request     |
| CMS                 | All       | Edit        | Read        | None          | None      | Edit        | None        |
| Users/roles         | All       | Limited     | None        | None          | None      | None        | None        |
| Audit logs          | All       | Read        | None        | Read          | Read      | None        | None        |

Matriks merupakan baseline. Implementasi final harus menggunakan permission codes granular, misalnya order.read, order.fulfill, refund.request, refund.approve, inventory.adjust, product.publish, asset.publish, user.role.manage.

## 14.3 Dashboard KPIs

| **KPI**         | **Definisi awal**                                               | **Dimensi**                    |
|-----------------|-----------------------------------------------------------------|--------------------------------|
| Gross sales     | Nilai line items sebelum diskon/refund sesuai accounting policy | Tanggal, collection, product   |
| Net sales       | Gross sales dikurangi diskon dan refund sesuai kebijakan        | Tanggal, channel               |
| AOV             | Net sales / jumlah order terpilih                               | Periode, customer cohort       |
| Conversion rate | Orders / eligible sessions                                      | Landing page, device, campaign |
| Payment success | Successful payment attempts / eligible attempts                 | Provider, method, period       |
| Return rate     | Returned units / sold units                                     | Product, category, period      |
| Stock cover     | Available stock / average daily units sold                      | SKU, warehouse                 |
| 3D engagement   | Viewer starts, interactions, completion events                  | Product, device, source        |

## 14.4 Admin workflows

- Product publish: draft → review → data/asset validation → preview → publish.

- Stock receive: select warehouse/SKU → quantity and reference → movement ledger → stock level update.

- Order fulfillment: paid order → picking → packing → label/tracking → shipped.

- Return: request → review → approve/reject → receive/inspect → refund/restock.

- 3D asset publish: upload → validation → preview → device check → publish asset version.

# 15. Security Architecture dan Threat Model

## 15.1 Security controls

| **Area**       | **Control baseline**                                                                              |
|----------------|---------------------------------------------------------------------------------------------------|
| Authentication | Argon2id password hash, MFA admin, session rotation/revocation, email verification                |
| Session        | HttpOnly, Secure, SameSite cookie; CSRF defense; session expiry and device/session list           |
| Authorization  | RBAC + resource ownership check + deny by default                                                 |
| API            | DTO validation, rate limit, CORS allowlist, CSP, request size limit, error sanitization           |
| Database       | Least privilege credentials, parameterized queries, private network, backups, encrypted transport |
| Payment        | Server-side secret, signature validation, provider status check, idempotency; no card CVV storage |
| Uploads        | Presigned upload, MIME sniff/validation, size cap, malware scan, random object key                |
| Admin          | MFA, sensitive action confirmation, audit logs, least privilege                                   |
| Secrets        | Secret manager, rotation, no secrets in Git or client bundle                                      |
| Privacy        | Data minimization, retention policy, consent, export/deletion procedures                          |

## 15.2 Threat model

| **Threat**                  | **Scenario**                                                    | **Mitigation**                                                  |
|-----------------------------|-----------------------------------------------------------------|-----------------------------------------------------------------|
| Credential stuffing         | Login attempts using leaked credentials                         | Rate limit, bot protection, MFA, alerting                       |
| Broken object authorization | User changes order ID to read another order                     | Ownership checks on every resource query                        |
| Price manipulation          | Client submits lower price or altered discount                  | Server-side price calculation and signed quote reference        |
| Overselling                 | Concurrent checkouts consume same last unit                     | Atomic reservation and stock ledger                             |
| Webhook spoofing            | Attacker posts fake paid notification                           | Signature verification, provider status validation              |
| Webhook replay              | Same payment event processed multiple times                     | Event dedupe and idempotent state transitions                   |
| Malicious file upload       | Uploaded GLB or image exploits parser or serves harmful content | Validation, scanning, isolated processing, safe content headers |
| Admin privilege escalation  | Low-privilege staff grants self elevated role                   | Separate user.role.manage permission and audit/approval         |
| Data leakage                | Sensitive values exposed in logs or API                         | Redaction, field allowlist, secure logging                      |
| DoS / resource abuse        | 3D asset or search endpoints abused                             | CDN, rate limit, size limit, concurrency cap, queue isolation   |

## 15.3 Security standard and verification

Gunakan OWASP ASVS 5.0 sebagai baseline requirement dan test checklist. Tentukan target verification level berdasarkan risiko, data yang diproses, dan eksposur aplikasi. Lakukan threat modeling untuk login, checkout, payment webhook, admin, upload 3D, returns/refunds, dan export data.

## 15.4 Privacy and data governance

- Hanya kumpulkan PII yang diperlukan untuk transaksi dan customer support.

- Tentukan retention untuk session, audit, payment events, dan customer data.

- Jangan simpan raw card credentials atau CVV.

- Masking email/phone pada log dan dashboard sesuai kebutuhan role.

- Catat consent untuk newsletter/marketing terpisah dari transaksi.

- Sediakan prosedur koreksi, akses, export, dan deletion sesuai kewajiban hukum yang berlaku.

# 16. Background Jobs, Events, dan Integrasi

## 16.1 Queue inventory

| **Queue**    | **Job**                                 | **Retry / priority**        |
|--------------|-----------------------------------------|-----------------------------|
| payment      | Verify webhook, query status, reconcile | High; bounded retries       |
| inventory    | Expire reservation, stock alerts        | High; idempotent            |
| order        | Order follow-up, fulfillment sync       | High/normal                 |
| shipping     | Create label, tracking sync             | Normal; provider backoff    |
| notification | Email/order updates                     | Normal; retry + DLQ         |
| media        | Resize, thumbnail, metadata extraction  | Low/normal                  |
| 3d-assets    | GLB parse, validate, compress, preview  | Low/normal; isolated worker |
| analytics    | Daily aggregates, 3D event rollups      | Low                         |

## 16.2 Event catalog

user.registered

product.published

product.variant.updated

inventory.received

inventory.reserved

inventory.released

order.created

payment.pending

payment.succeeded

payment.failed

order.ready_to_ship

shipment.dispatched

shipment.delivered

return.requested

refund.completed

asset.validation.completed

asset.published

## 16.3 Transactional outbox

Saat transaksi database penting mengubah entity dan perlu memicu event, tulis event ke outbox_events dalam transaksi yang sama. Worker mengambil event yang belum dipublikasikan, mengirim ke queue, lalu menandai published. Handler harus idempotent karena delivery dapat terjadi lebih dari sekali.

| **Outbox field**              | **Fungsi**                   |
|-------------------------------|------------------------------|
| id                            | UUID event                   |
| aggregate_type + aggregate_id | Domain entity reference      |
| event_type + schema_version   | Nama event dan versi payload |
| payload                       | Data event yang disanitasi   |
| occurred_at                   | Waktu domain event           |
| published_at                  | Waktu berhasil dipublish     |
| attempts / last_error         | Retry diagnostics            |

## 16.4 External provider adapters

| **Provider class**    | **Interface contract**                                        |
|-----------------------|---------------------------------------------------------------|
| PaymentProvider       | createSession, getStatus, verifyWebhook, refund               |
| ShippingProvider      | getRates, createShipment, getTracking, cancelShipment         |
| EmailProvider         | sendTransactional, sendTemplate                               |
| ObjectStorageProvider | createPresignedUpload, headObject, deleteObject, publishAsset |
| AnalyticsExporter     | emitEvent, aggregatePeriod                                    |

# 17. DevOps, Deployment, dan Observability

## 17.1 Environment

| **Environment** | **Tujuan**                 | **Data dan credential**                                  |
|-----------------|----------------------------|----------------------------------------------------------|
| Local           | Developer workflow         | Synthetic seed, local DB/Redis, sandbox keys             |
| CI              | Build and test             | Ephemeral database and test fixtures                     |
| Staging         | Pre-production E2E and UAT | Separate provider sandbox and storage bucket             |
| Production      | Live business              | Managed DB/Redis, production keys, backup and monitoring |

## 17.2 Local infrastructure

docker compose services:

\- postgres: supported PostgreSQL 18.x patch

\- redis: supported Redis 8.x release

\- mailpit: local email capture (optional)

\- minio: local S3-compatible storage (optional)

apps: pnpm dev --filter storefront --filter admin --filter api --filter worker

Container image production harus dipin ke versi/sha yang telah diuji. Jangan mengekspos database dan Redis ke internet publik. Gunakan Docker secrets atau secret manager pada lingkungan produksi.

## 17.3 CI/CD pipeline

Pull request → frozen install → lint/typecheck → unit and integration tests → build → SAST/dependency/secret scan → staging deploy → E2E/accessibility/smoke tests → release approval → production health checks and rollback monitoring.

## 17.4 Database operations

- Migration harus backward-compatible bila deployment berlangsung tanpa downtime.

- Gunakan expand-migrate-contract untuk perubahan kolom besar.

- Jalankan backup otomatis dan lakukan restore drill berkala.

- Atur connection pooling dan batas koneksi per app.

- Gunakan read replicas hanya bila workload read membutuhkannya dan consistency requirement jelas.

- Review query plan untuk endpoint catalog, order history, inventory, dan analytics.

## 17.5 Observability

| **Signal** | **Contoh metrik**                                                            |
|------------|------------------------------------------------------------------------------|
| Logs       | request_id, actor_id (pseudonymous), route, status, duration, error_code     |
| Metrics    | HTTP p95, 5xx rate, DB pool saturation, Redis memory, queue lag              |
| Tracing    | checkout span, payment provider call, inventory transaction, webhook handler |
| Business   | checkout failure, payment success, order processing time, return rate        |
| 3D         | asset bytes, load time, viewer error, WebGL context loss, fallback usage     |

## 17.6 Backup and disaster recovery

| **Asset/data** | **Backup policy baseline**                                                        |
|----------------|-----------------------------------------------------------------------------------|
| PostgreSQL     | Automated backups + point-in-time recovery where supported; periodic restore test |
| Object storage | Versioning for published 3D assets; lifecycle and deletion policy                 |
| Redis          | Treat cache as rebuildable; queue persistence policy documented                   |
| Secrets        | Store in secret manager; recovery access controlled                               |
| Docs/config    | Version control; secure copy of deployment config without secrets                 |

RPO dan RTO harus ditentukan oleh owner bisnis sebelum production. Jangan menetapkan angka tanpa menilai biaya downtime, kapasitas backup, dan kemampuan recovery provider.

# 18. QA, Testing, dan Acceptance Criteria

## 18.1 Test pyramid

| **Level**         | **Tool**                   | **Fokus**                                               |
|-------------------|----------------------------|---------------------------------------------------------|
| Unit              | Vitest/Jest                | Pricing, state transition, stock math, permission rules |
| Integration       | Testcontainers / test DB   | Prisma transaction, outbox, repository                  |
| API E2E           | Supertest                  | HTTP contract, auth, validation, webhook                |
| Browser E2E       | Playwright                 | Customer purchase and admin workflows                   |
| Visual regression | Playwright screenshots     | Layout and responsive regressions                       |
| Accessibility     | axe-core + manual          | Keyboard, screen reader semantics, contrast             |
| Load              | k6                         | Catalog, checkout, payment webhook, admin list          |
| Security          | SAST/DAST/dependency scan  | Common vulnerabilities and misconfiguration             |
| 3D compatibility  | Real device/browser matrix | GPU, WebGL, memory, touch, fallback                     |

## 18.2 Critical test scenarios

- Concurrent checkout untuk stok tersisa satu hanya menghasilkan satu successful reservation.

- Duplicate payment webhook tidak menggandakan payment state, order confirmation, atau inventory commit.

- Redirect browser sukses tanpa webhook tidak mengubah order menjadi paid.

- Harga yang diubah setelah item masuk cart dihitung ulang pada checkout quote.

- User A tidak dapat mengakses order, address, atau return milik User B.

- Admin dengan role content tidak dapat membuat refund atau stock adjustment.

- GLB malformed gagal publish dan tidak tersedia ke customer.

- WebGL unavailable tetap memungkinkan add-to-cart dan checkout.

- Outfit Studio menolak kombinasi garment dengan rig atau slot yang tidak kompatibel.

- Restore database diuji pada staging dan hasilnya diverifikasi.

## 18.3 Definition of Done

- Requirement/acceptance criteria terpenuhi dan direview.

- Error, empty, loading, disabled, success states tersedia.

- Authorization dan validation diuji.

- Unit/integration/E2E test sesuai risiko lulus.

- Tidak ada critical/high security issue terbuka tanpa accepted exception.

- Instrumentation/logging tersedia tanpa membocorkan PII/secret.

- Dokumentasi dan ADR diperbarui.

- UI diuji pada mobile, tablet, desktop, keyboard, dan reduced-motion.

## 18.4 Release gates

| **Gate**         | **Syarat**                                               |
|------------------|----------------------------------------------------------|
| Feature complete | All P0/P1 scope for milestone complete                   |
| Data integrity   | No unresolved transaction/inventory invariant failure    |
| Security         | Critical/high finding fixed or formal risk acceptance    |
| Performance      | Budget met on agreed test devices and load profile       |
| Accessibility    | No critical blocker; keyboard and semantic path verified |
| Operations       | Alerting, backup, runbook, rollback, on-call owner ready |
| Business UAT     | Owner and operational staff sign off core workflow       |

# 19. Roadmap dan Engineering Backlog

## 19.1 Roadmap 18 minggu

| **Phase**               | **Periode indikatif** | **Deliverables**                                               | **Exit criteria**                          |
|-------------------------|-----------------------|----------------------------------------------------------------|--------------------------------------------|
| 01 Discovery            | Week 1                | PRD, business rules, catalog seed, architecture decisions      | Scope dan asumsi disetujui                 |
| 02 Foundation           | Week 2-3              | Monorepo, apps, DB, auth, RBAC, CI, local infra                | Build/deploy dev berhasil                  |
| 03 Catalog              | Week 4-5              | Products, variants, category, collections, search/filter       | Catalog CRUD dan storefront browsing lulus |
| 04 Inventory/Cart       | Week 6                | Warehouse, movements, reservations, cart                       | Stock invariant dan cart flow lulus        |
| 05 Checkout/Payment     | Week 7-8              | Quote, order, payment provider, webhook, shipment baseline     | Sandbox payment E2E lulus                  |
| 06 Admin/CMS            | Week 9-10             | Dashboard, catalog operations, orders, CMS, analytics baseline | Operational UAT lulus                      |
| 07 Product 3D           | Week 11-12            | Asset pipeline, viewer, customizer, fallback                   | Asset validation dan mobile tests lulus    |
| 08 3D Spaces            | Week 13-15            | Showroom, hotspots, mannequin outfit studio                    | Scene flows dan performance tests lulus    |
| 09 Production readiness | Week 16-18            | Security, load, SEO, accessibility, backups, deploy            | Release gates lulus                        |

Roadmap adalah estimasi perencanaan untuk tim kecil dengan desain dan produksi aset 3D berjalan paralel. Waktu aktual bergantung pada jumlah model, kualitas tech pack, integrasi provider, dan kesiapan operasional bisnis.

## 19.2 Backlog per workstream

| **Workstream** | **Epic**                 | **Contoh task**                                    |
|----------------|--------------------------|----------------------------------------------------|
| Foundation     | Repo and tooling         | workspace, turbo pipelines, lint, typecheck, CI    |
| Identity       | Auth and RBAC            | register/login, session, MFA admin, permissions    |
| Catalog        | Product management       | product CRUD, variants, media, publish rules       |
| Discovery      | Search and merchandising | filters, sorting, collections, SEO metadata        |
| Inventory      | Stock ledger             | receipt, adjust, reserve, release, commit          |
| Commerce       | Cart and checkout        | cart merge, quote, coupon, order snapshots         |
| Payment        | Gateway integration      | session, webhook verification, reconciliation      |
| Fulfillment    | Shipment and returns     | label, tracking, return approval, refund           |
| 3D             | Asset pipeline           | Blender convention, upload, validator, CDN, viewer |
| Experience     | Showroom and outfit      | scene navigation, hotspots, garment compatibility  |
| Admin          | Operations UI            | dashboard, tables, filters, bulk actions, audit    |
| Platform       | Reliability              | monitoring, alert, backup, restore, runbooks       |

## 19.3 Suggested sprint sequencing

- Sprint 0: discovery, ADRs, data dictionary, design tokens, dev environment.

- Sprint 1: auth, users, roles, catalog schema, seed.

- Sprint 2: catalog API, storefront listing/detail, variants, media.

- Sprint 3: inventory ledger, cart, promotions baseline.

- Sprint 4: checkout quote, reservation, order, payment sandbox.

- Sprint 5: admin orders/inventory, shipping, email.

- Sprint 6: 3D product viewer and asset pipeline.

- Sprint 7: showroom/outfit, QA, hardening, launch readiness.

# 20. Risiko, Asumsi, dan Keputusan Terbuka

## 20.1 Risk register

| **Risiko**                                     | **Probabilitas/dampak** | **Mitigasi**                                                        | **Owner**      |
|------------------------------------------------|-------------------------|---------------------------------------------------------------------|----------------|
| 3D asset produksi lebih lambat dari software   | Tinggi/tinggi           | Mulai dengan 3-5 hero assets; standardisasi Blender file dan naming | 3D lead        |
| Model terlalu berat untuk mobile               | Sedang/tinggi           | LOD, compression, poster fallback, device testing                   | Frontend/3D    |
| Scope Outfit Studio melebar ke virtual fitting | Tinggi/tinggi           | Batasi mannequin preset; buat ADR untuk simulation scope            | Product owner  |
| Payment status tidak sinkron                   | Sedang/tinggi           | Webhook validation, reconciliation, outbox, alert                   | Backend        |
| Overselling saat traffic burst                 | Sedang/tinggi           | Atomic reservation, locking, load test                              | Backend/DB     |
| Data produk tidak lengkap                      | Tinggi/sedang           | Catalog completeness checklist dan publish gate                     | Merchandising  |
| Provider shipping tidak cocok                  | Sedang/sedang           | Provider adapter dan sandbox test sebelum lock                      | Operations     |
| Admin permission terlalu luas                  | Sedang/tinggi           | Permission matrix, deny-by-default, audit                           | Security/Owner |
| Roadmap 18 minggu terlalu optimistis           | Sedang/tinggi           | Milestone gates dan scope trade-offs                                | Project lead   |

## 20.2 Decisions required before implementation

| **Decision**       | **Pilihan yang perlu dikunci**              | **Rekomendasi default**                               |
|--------------------|---------------------------------------------|-------------------------------------------------------|
| Brand/legal        | ARVEN availability, trademark, domain, logo | Lakukan clearance sebelum campaign publik             |
| Product assortment | Jumlah produk/variant awal dan size chart   | Mulai dengan 20-40 products; 3-8 variants per product |
| Price/tax          | Tax treatment, discounts, rounding          | Validasi dengan finance/accounting                    |
| Shipping           | Provider, coverage, SLA, COD policy         | Pilih provider setelah simulasi alamat dan service    |
| Payment            | Methods, settlement, refund, expiry         | Midtrans sandbox lalu production review               |
| Warehouse          | Satu atau lebih lokasi, reservation timeout | Satu gudang awal; reservation expiry configurable     |
| Returns            | Window, condition, shipping responsibility  | Tentukan policy bisnis dan legal                      |
| 3D quality         | Model source, production vendor, review     | Mulai dengan hero products dan standard pipeline      |
| Analytics/privacy  | Consent, retention, event taxonomy          | Data minimization dan no PII in analytics events      |
| SLA/DR             | Availability, RPO, RTO                      | Tentukan bersama owner berdasarkan biaya              |

## 20.3 Assumptions to validate

- Apakah brand akan menjual produk sendiri atau menjual brand pihak ketiga? Blueprint mengasumsikan produk milik ARVEN.

- Apakah harga dan stok dikelola satu gudang? Model siap multi-gudang, tetapi launch diasumsikan satu gudang.

- Apakah pelanggan bisa checkout sebagai guest? Direkomendasikan ya.

- Apakah 3D tersedia untuk semua produk? Direkomendasikan hanya produk terpilih pada awal peluncuran.

- Apakah showroom merupakan halaman marketing atau ruang interaktif penuh? Scope ini memilih ruang interaktif dengan hotspot, bukan game open-world.

- Apakah Outfit Studio menyimpan outfit untuk akun pengguna? Direkomendasikan hanya untuk pengguna login, dengan guest draft opsional.

# 21. Referensi Teknis Resmi

Referensi berikut menjadi titik awal verifikasi implementasi. Periksa kembali dokumentasi, compatibility matrix, security advisories, dan release channel ketika dependency dikunci ke lockfile proyek.

- **Next.js App Router —** https://nextjs.org/docs/app Routing, Server Components, rendering, data fetching.

- **Next.js 16 release notes —** https://nextjs.org/blog/next-16 Fitur dan perubahan major Next.js 16.

- **React Three Fiber documentation —** https://r3f.docs.pmnd.rs/getting-started/introduction Integrasi React dengan Three.js; v9 berpasangan dengan React 19.

- **Three.js documentation —** https://threejs.org/docs/ Renderer, loaders, controls, materials, WebGL.

- **NestJS documentation —** https://docs.nestjs.com/ Modules, guards, validation, queue, database integration.

- **Prisma ORM documentation —** https://www.prisma.io/docs/orm Schema, client, migrations, database adapters; cek status stable/RC.

- **PostgreSQL 18 documentation —** https://www.postgresql.org/docs/18/ Transactions, indexes, constraints, locking, JSONB.

- **Redis documentation —** https://redis.io/docs/latest/ Redis operations, persistence, security, version lifecycle.

- **Midtrans handle notifications —** https://docs.midtrans.com/reference/handle-notifications Signature key dan validasi notifikasi pembayaran.

- **OWASP ASVS 5.0 —** https://asvs.owasp.org/ Security verification requirements.

- **BullMQ documentation —** https://docs.bullmq.io/ Queues, workers, retries, rate limits, flows.

- **Cloudflare R2 S3 API —** https://developers.cloudflare.com/r2/api/s3/api/ S3-compatible object storage integration.

# Lampiran A. Initial Release Checklist

- [ ] Brand name and trademark/domain review completed

- [ ] Product assortment, SKU format, price, size chart approved

- [ ] PRD and business policies signed off

- [ ] Monorepo and CI/CD pipeline operational

- [ ] Database schema reviewed and migrations reproducible

- [ ] Authentication and authorization tested

- [ ] Catalog and product variant workflow operational

- [ ] Inventory movements and stock reservation tested under concurrency

- [ ] Cart and checkout total calculated server-side

- [ ] Payment sandbox and webhook validation tested

- [ ] Order, shipment, return and refund workflows tested

- [ ] Admin permissions and audit logs reviewed

- [ ] 3D asset pipeline documented and repeatable

- [ ] 3D viewer has poster and static-image fallback

- [ ] Showroom loads zones lazily and supports mobile navigation

- [ ] Outfit Studio only offers compatible garment/avatar combinations

- [ ] Security scan and manual authorization tests completed

- [ ] Accessibility and responsive regression completed

- [ ] Monitoring, alerting, backup and restore drill completed

- [ ] Production runbook, rollback plan and support ownership documented

# Lampiran B. Suggested ADR Template

\# ADR-NNN: \[Decision title\]

Status: Proposed \| Accepted \| Superseded

Date: YYYY-MM-DD

Owners: \[team/owner\]

\## Context

Problem, constraints, and evidence.

\## Decision

The selected approach and scope.

\## Alternatives considered

Option A, Option B, Option C.

\## Consequences

Benefits, trade-offs, operational impact, migration plan.

\## Verification

Tests, metrics, and conditions that would trigger reconsideration.

# Lampiran C. Suggested Definition of a Ready Product

- Produk memiliki nama, slug, deskripsi, kategori, material, fit, dan care instruction.

- Produk memiliki setidaknya satu variant aktif dengan SKU unik dan harga valid.

- Size guide tersedia sesuai jenis produk.

- Media utama, gallery, alt text, dan urutan tampilan sudah diset.

- Inventory level tersedia untuk warehouse yang digunakan.

- SEO title dan description ditinjau.

- Jika 3D aktif: model valid, poster ada, version aktif, material slot tervalidasi, mobile fallback tersedia.

- Product manager telah menyetujui preview sebelum publish.

# Lampiran D. Production Cutover Runbook

| **Urutan** | **Aksi**                                            | **Validasi**                                             |
|------------|-----------------------------------------------------|----------------------------------------------------------|
| 1          | Freeze perubahan schema dan konfigurasi             | Release candidate dan migration plan disetujui           |
| 2          | Verifikasi backup dan restore checkpoint            | Backup dapat diakses; restore drill tercatat             |
| 3          | Deploy API dan worker yang kompatibel               | Health/readiness checks lulus                            |
| 4          | Jalankan migration backward-compatible              | Schema version dan migration log benar                   |
| 5          | Deploy storefront dan admin                         | Smoke test halaman utama, login, katalog                 |
| 6          | Verifikasi payment dan shipping production settings | Credential, webhook URL, callback, provider status valid |
| 7          | Jalankan transaksi uji yang disetujui               | Order, payment, stock, email, shipment sinkron           |
| 8          | Aktifkan traffic bertahap dan monitor               | Error, latency, checkout, queue backlog normal           |
| 9          | Tutup release atau rollback                         | Owner menyetujui hasil; rollback plan tersedia           |

# Lampiran E. Handover Artefacts

| **Artefact**      | **Isi minimum**                                        | **Owner**         |
|-------------------|--------------------------------------------------------|-------------------|
| Product pack      | PRD, user stories, acceptance criteria, policy         | Product owner     |
| Design pack       | Design tokens, page layouts, responsive specs, assets  | Design lead       |
| Architecture pack | C4/system diagram, module map, ADR, threat model       | Tech lead         |
| Data pack         | ERD, data dictionary, migrations, seed strategy        | Backend/DB        |
| API pack          | OpenAPI spec, auth guide, error catalog, webhook guide | Backend           |
| 3D pack           | Blender conventions, asset manifest, validation report | 3D lead           |
| Operations pack   | Runbooks, alerts, backup/restore, support escalation   | DevOps/operations |
| QA pack           | Test plan, E2E flows, device matrix, release evidence  | QA lead           |
