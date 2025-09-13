# SecureChat Application

## Overview

SecureChat is an end-to-end encrypted messaging application built with a modern full-stack architecture. The application provides secure real-time communication between users with client-side encryption, contact management, and a clean, responsive user interface. The system ensures that only the intended recipients can read messages through RSA-OAEP and AES-GCM encryption implemented entirely on the client side.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built using React with TypeScript and follows a component-based architecture:
- **UI Framework**: React 18 with TypeScript for type safety
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation schemas
- **Build Tool**: Vite for fast development and optimized production builds

The frontend implements end-to-end encryption using the Web Crypto API, ensuring messages are encrypted before transmission and decrypted only by the intended recipient.

### Backend Architecture
The backend follows a RESTful API design with real-time capabilities:
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for type safety across the entire codebase
- **API Design**: RESTful endpoints for CRUD operations with WebSocket support for real-time messaging
- **Session Management**: Express sessions with PostgreSQL session storage
- **Error Handling**: Centralized error handling middleware with structured error responses

### Authentication System
The application uses Replit's OpenID Connect (OIDC) authentication:
- **Provider**: Replit OIDC for seamless integration with the Replit platform
- **Strategy**: Passport.js with OpenID Connect strategy
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Security**: HTTP-only cookies with secure flags and CSRF protection

### Database Architecture
The system uses PostgreSQL with Drizzle ORM for type-safe database operations:
- **ORM**: Drizzle ORM with PostgreSQL dialect for type-safe queries
- **Connection**: Neon serverless PostgreSQL with connection pooling
- **Schema**: Strongly typed schema definitions shared between client and server
- **Migrations**: Drizzle Kit for database schema migrations

### Real-time Communication
WebSocket implementation for instant messaging:
- **Protocol**: WebSocket for bidirectional real-time communication
- **Features**: Message delivery, typing indicators, and connection status
- **Encryption**: All messages encrypted client-side before transmission
- **Reconnection**: Automatic reconnection logic with exponential backoff

### Encryption Architecture
Client-side end-to-end encryption implementation:
- **Key Generation**: RSA-OAEP 2048-bit key pairs generated per user
- **Message Encryption**: Hybrid encryption using RSA-OAEP for key exchange and AES-GCM for message content
- **Key Storage**: Public keys stored on server, private keys remain client-side only
- **Security**: Messages are encrypted before leaving the client and decrypted only by the recipient

## External Dependencies

### Database and Storage
- **Neon Database**: Serverless PostgreSQL database for production-ready data storage
- **PostgreSQL**: Primary database for user data, messages, and session storage

### Authentication Services
- **Replit OIDC**: OpenID Connect provider for user authentication and authorization
- **Passport.js**: Authentication middleware supporting the OIDC strategy

### Development and Deployment
- **Replit Platform**: Integrated development and deployment environment
- **Vite**: Build tool with development server and hot module replacement
- **TypeScript**: Type checking and compilation across the entire stack

### UI and Styling
- **Radix UI**: Headless component primitives for accessible UI components
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Lucide React**: Icon library for consistent iconography

### Real-time and Networking
- **WebSocket (ws)**: WebSocket library for real-time communication on the server
- **Web Crypto API**: Browser-native cryptographic functions for client-side encryption

The application is designed to be self-contained with minimal external API dependencies, focusing on security and privacy through client-side encryption and secure authentication flows.