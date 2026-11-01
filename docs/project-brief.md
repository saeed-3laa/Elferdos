# Project: Al-Ferdous Wholesale Ordering System

ملاحظة ٣١ أكتوبر ٢٠٢٦: هذه وثيقة مرحلة سابقة؛ أي ذكر لأرصدة المخزن أو الجرد أو الحجز الكمي متقاعد منذ 028. راجع operations.md وadmin.md للنموذج الحالي، وmanual-availability-cleanup.md لتنظيف 030.

Act as a senior full-stack engineer, software architect, QA engineer, and UI/UX designer.

Build a complete, production-oriented Arabic RTL wholesale ordering web application for a wholesale warehouse named "مخزن الفردوس" in Egypt.

This is a real business application, not a landing page, UI mockup, or prototype with fake buttons.

## 1. Technology Stack

Use:
- Next.js with App Router and TypeScript.
- Tailwind CSS.
- A consistent, reusable component system.
- Supabase PostgreSQL for the database.
- Supabase Auth for authentication.
- Supabase Storage for product images initially.
- Zod or an equivalent schema validation library.
- A reliable Excel import/export library supporting Arabic text.
- Vitest for unit and integration tests.
- Playwright for end-to-end browser tests.
- ESLint and TypeScript strict mode.

Use currently supported stable package versions and compatible dependencies.

Keep business logic, database access, validation, and UI components separated.

## 2. Language and Visual Design

The entire application must be in Arabic with genuine RTL support.

Requirements:
- Set the document language to Arabic and direction to RTL.
- Use a professional Arabic font such as IBM Plex Sans Arabic or Cairo.
- Use a restrained wholesale-business palette: white, light gray, dark navy, and muted green.
- Use readable tables, compact forms, clear navigation, and practical inventory-management layouts.
- Avoid excessive gradients, decorative animations, oversized cards, unnecessary charts, and generic AI-generated dashboard styling.
- Make every page responsive, especially on Android mobile screens.
- Use EGP currency formatting and Arabic labels.
- Support search, sorting, filtering, pagination, empty states, loading states, and meaningful error messages.
- Use consistent spacing, typography, buttons, forms, tables, and status indicators.
- Do not use emojis as interface icons.

The interface must look like a real wholesale distribution system.

## 3. Public Product Catalog

Visitors can browse products and prices without registering.

Implement:
- Product categories and search.
- Product images, names, codes, descriptions, and prices.
- Product availability status.
- Cart and quantity selection.
- Unit selection where applicable: piece, box, or carton.
- Display the number of pieces per carton.
- Show active promotions and the applicable final price.
- Prevent ordering inactive products.
- Clearly explain minimum order quantities and applicable conditions.

Customers must register or sign in before submitting an order.

## 4. Authentication and Customer Accounts

Implement customer registration and login.

Customer fields:
- Full name.
- Mobile number.
- Shop name.
- Delivery address.
- Area or neighborhood.
- Optional delivery notes.

Customers can:
- Edit their own profile.
- Manage their saved delivery addresses.
- View their own order history and order statuses.
- Repeat previous orders using current applicable prices.

Never allow customers to view or modify other customers' records.

Use secure authentication and server-side authorization.

Phone verification must be optional until an SMS provider is configured. Never pretend an OTP was sent when no provider is connected.

## 5. Product Management

Administrators can:
- Create, edit, activate, deactivate, and archive products.
- Upload, replace, and remove product images.
- Edit product names, codes, categories, and descriptions.
- Manage units and conversion factors.
- Set piece prices and carton prices independently.
- Set the number of pieces per carton.
- Update stock quantities manually.
- Search, filter, sort, and paginate products.
- Import product updates from Excel.

Use stable product IDs and unique product codes.

Prefer archiving products over permanently deleting records referenced by historical orders.

Validate all inputs on the server.

## 6. Pricing Engine

Implement a centralized, server-side pricing engine.

Support:
- Base prices per product and unit.
- Quantity-based price tiers.
- Customer-specific prices.
- Customer-specific quantity tiers.
- Percentage discounts.
- Fixed promotional prices.
- Promotions affecting individual products or selected categories.
- Promotions affecting all eligible products.
- Start dates and expiration dates.
- Minimum quantities and customer eligibility conditions.
- Active/inactive promotion status.

For each order item, calculate all eligible prices and select the lowest valid final price.

Do not stack discounts.

Define and document how promotional prices interact with customer-specific prices and quantity tiers. Never apply an ineligible offer.

Calculate prices on the server, not from client-submitted totals.

Store an immutable snapshot of the product name, SKU, unit, quantity, unit price, discount, and line total for each confirmed order.

Use decimal-safe monetary calculations and validate rounding rules.

Create comprehensive tests for pricing conflicts and boundary conditions.

## 7. Promotions Management

Provide an Arabic administration interface to:
- Create percentage-based promotions.
- Create fixed-price promotions.
- Select products, categories, or all eligible products.
- Set start and end dates.
- Define minimum quantities and eligible customers.
- Preview the resulting price.
- Activate, deactivate, and edit promotions.

Prevent invalid dates, negative prices, overlapping rule ambiguity, and duplicate discount application.

## 8. Stock Management

The existing warehouse system is Bella System.

Bella System and this application MUST remain separate. Do not invent or assume a Bella System API.

Implement manual stock updates and Excel-based stock imports.

Each stock update should record:
- Product ID.
- Previous quantity.
- New quantity.
- Update timestamp.
- Admin or staff member.
- Import batch or update source.

Track when stock was last updated.

Do not claim that website stock is real-time warehouse stock.

For the initial version, stock is periodically updated manually or through Excel. Implement a configurable stock policy and warn administrators when stock data is stale.

Use a reservation or order-validation policy that prevents overselling based on the latest available website stock, while clearly acknowledging that Bella System may contain newer stock movements.

## 9. Orders and Fulfillment

Implement:
- Cart review and checkout.
- Delivery address selection.
- Order confirmation.
- Unique order numbers.
- Customer order history.
- Admin order management.
- Search and filters by customer, order number, date, and status.
- Order detail pages.
- Order notes and cancellation reasons.
- Reordering previous orders using current prices.

Use a clear order state machine, for example:
NEW, CONFIRMED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.

Validate permitted status transitions server-side.

Prevent duplicate submissions and duplicate order creation on retries.

Store historical prices and customer/address snapshots with each order.

Bella System remains responsible for official warehouse invoices and actual warehouse stock records.

Provide a clean order export suitable for manually entering orders into Bella System.

## 10. Excel Import and Export

Implement real XLSX import and export functionality.

Support:
- Product exports.
- Customer exports.
- Order and order-item exports.
- Stock exports.
- Sales reports.
- Quantity and pricing rule exports where practical.

For imports:
- Provide downloadable Arabic Excel templates.
- Identify records using stable IDs or unique codes.
- Validate the entire file before committing changes.
- Show a preview of additions, updates, and validation errors.
- Detect duplicate identifiers.
- Support partial correction and re-import of rejected rows.
- Use database transactions where appropriate.
- Record import history and the responsible user.
- Never silently overwrite unrelated records.
- Handle Arabic text and Egyptian product names correctly.

Export Arabic column headings and numeric values that open correctly in Microsoft Excel.

## 11. Reports and Analytics

Implement real database-backed reports for:
- Daily and monthly order totals.
- Sales by product and category.
- Best-selling products.
- Low-stock products.
- Customer purchase history.
- Most active customers.
- Cancelled orders.
- Order status distribution.
- Promotion usage.
- Sales before and after discounts.

Clearly distinguish order value from delivered sales and collected cash.

Do not calculate net profit unless product cost data and the chosen cost-accounting method are available.

Allow date-range filtering and Excel export.

## 12. Staff Accounts and Audit Logs

Implement role-based access control.

Suggested roles:
- OWNER: full access.
- MANAGER: products, prices, promotions, customers, and reports according to permissions.
- ORDER_STAFF: view and process orders without changing protected pricing settings.
- VIEWER: read-only access to explicitly permitted information.

The owner can manage staff accounts and permissions.

Record sensitive administrative changes, including price updates, promotion changes, stock imports, order status changes, and permission changes.

Never trust role information supplied by the browser.

## 13. Database and Security

Create version-controlled SQL migrations and appropriate indexes, foreign keys, constraints, and transactional operations.

Implement Supabase Row Level Security policies for all exposed tables.

Use server-side authorization in addition to database policies.

Never expose the Supabase service-role key or any other secret to the browser.

Use environment variables and provide:
- `.env.example` containing placeholders only.
- `.gitignore` that excludes real environment files.
- A clear setup guide.
- Database migrations.
- A development-only seed script with fictional sample data.
- An admin bootstrap process that does not rely on a hardcoded production password.

Do not commit secrets or real customer information.

Implement error handling, input validation, rate limiting for sensitive endpoints, secure image upload validation, and safe logging.

## 14. Testing Requirements

Do not consider the project complete just because it builds.

Write and run tests for:
- Registration and authentication.
- Customer data isolation.
- Staff permissions.
- Product CRUD.
- Unit conversions.
- Quantity-based pricing.
- Customer-specific pricing.
- Promotion eligibility and expiration.
- Selecting the best valid price without stacking discounts.
- Cart and checkout calculations.
- Duplicate order submission.
- Order status transitions.
- Stock updates and stale stock warnings.
- Excel imports, validation errors, and exports.
- Reports and date filters.
- Mobile and RTL layouts.
- Unauthorized access attempts.

Use fictional seed data.

Create a test report listing passed tests, failed tests, and any unimplemented features.

Never claim a test passed unless it was actually executed.

## 15. Deployment and Documentation

Prepare the application for local development and deployment to Vercel or another compatible host.

Include:
- Installation instructions.
- Local environment configuration.
- Supabase project setup.
- SQL migration instructions.
- Seed data instructions.
- Test commands.
- Production build verification.
- Deployment instructions.
- Environment variable configuration.
- Backup and recovery guidance.
- A troubleshooting guide.

Support separate development, preview/testing, and production environments.

Never run destructive database migrations against production without explicit approval and a backup plan.

## 16. Required Development Workflow

Work incrementally.

First inspect the repository and explain the implementation plan.

Then create the project foundation and implement one coherent phase at a time.

After each phase:
1. Run the relevant tests.
2. Run lint and TypeScript checks.
3. Fix errors before proceeding.
4. Update the documentation.
5. Report exactly what is implemented and what remains.

Do not replace real functionality with mock buttons, hardcoded dashboard numbers, fake notifications, or simulated successful API responses.

If a third-party service is not configured, provide a clear configuration status and a documented development alternative.

Begin by creating the architecture, folder structure, database schema, migration plan, and first implementation milestone. Do not attempt to generate the entire system in one unverified step.