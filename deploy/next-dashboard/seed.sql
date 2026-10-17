CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    image_url character varying(255) NOT NULL
);
CREATE TABLE public.invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    amount integer NOT NULL,
    status character varying(255) NOT NULL,
    date date NOT NULL
);
CREATE TABLE public.revenue (
    month character varying(4) NOT NULL,
    revenue integer NOT NULL
);
CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email text NOT NULL,
    password text NOT NULL
);
INSERT INTO public.customers VALUES ('3958dc9e-712f-4377-85e9-fec4b6a6442a', 'Delba de Oliveira', 'delba@oliveira.com', '/customers/delba-de-oliveira.png');
INSERT INTO public.customers VALUES ('3958dc9e-742f-4377-85e9-fec4b6a6442a', 'Lee Robinson', 'lee@robinson.com', '/customers/lee-robinson.png');
INSERT INTO public.customers VALUES ('76d65c26-f784-44a2-ac19-586678f7c2f2', 'Michael Novotny', 'michael@novotny.com', '/customers/michael-novotny.png');
INSERT INTO public.customers VALUES ('d6e15727-9fe1-4961-8c5b-ea44a9bd81aa', 'Evil Rabbit', 'evil@rabbit.com', '/customers/evil-rabbit.png');
INSERT INTO public.customers VALUES ('cc27c14a-0acf-4f4a-a6c9-d45682c144b9', 'Amy Burns', 'amy@burns.com', '/customers/amy-burns.png');
INSERT INTO public.customers VALUES ('13d07535-c59e-4157-a011-f8d2ef4e0cbb', 'Balazs Orban', 'balazs@orban.com', '/customers/balazs-orban.png');
INSERT INTO public.invoices VALUES ('fa32b193-76dc-4a4d-bbb3-d6324dd248b7', '3958dc9e-712f-4377-85e9-fec4b6a6442a', 20348, 'pending', '2022-11-14');
INSERT INTO public.invoices VALUES ('136d543f-4a70-409f-b552-6052e1cb5c5d', '13d07535-c59e-4157-a011-f8d2ef4e0cbb', 34577, 'pending', '2023-08-05');
INSERT INTO public.invoices VALUES ('6fc644ce-6cfa-43f5-8099-b1a3d7ec038d', '3958dc9e-742f-4377-85e9-fec4b6a6442a', 54246, 'pending', '2023-07-16');
INSERT INTO public.invoices VALUES ('2bff50bf-f828-4513-a027-1c8e1178aa28', 'd6e15727-9fe1-4961-8c5b-ea44a9bd81aa', 666, 'pending', '2023-06-27');
INSERT INTO public.invoices VALUES ('720f85fb-d436-4167-ba99-a93a21f7bf5d', 'd6e15727-9fe1-4961-8c5b-ea44a9bd81aa', 15795, 'pending', '2022-12-06');
INSERT INTO public.invoices VALUES ('612c943b-6c2e-4c90-be29-1ca4bf0eddcd', '13d07535-c59e-4157-a011-f8d2ef4e0cbb', 8945, 'paid', '2023-06-03');
INSERT INTO public.invoices VALUES ('d247070c-1a0a-4ea5-9f2f-059ffee0cccf', '3958dc9e-742f-4377-85e9-fec4b6a6442a', 1000, 'paid', '2022-06-05');
INSERT INTO public.invoices VALUES ('cc702468-2fdf-4df5-9723-4f4a0e585772', 'cc27c14a-0acf-4f4a-a6c9-d45682c144b9', 3040, 'paid', '2022-10-29');
INSERT INTO public.invoices VALUES ('043d764b-105c-4385-86b8-3af9692b27bb', '76d65c26-f784-44a2-ac19-586678f7c2f2', 44800, 'paid', '2023-09-10');
INSERT INTO public.invoices VALUES ('2eb4f2e7-bfa0-4288-9670-4aa2374ce2bc', '76d65c26-f784-44a2-ac19-586678f7c2f2', 32545, 'paid', '2023-06-09');
INSERT INTO public.invoices VALUES ('bd524f45-9425-4475-9cda-f2c5d848d290', 'cc27c14a-0acf-4f4a-a6c9-d45682c144b9', 1250, 'paid', '2023-06-17');
INSERT INTO public.invoices VALUES ('35d79fd9-d81b-4b72-9624-1295eb5fb092', '13d07535-c59e-4157-a011-f8d2ef4e0cbb', 8546, 'paid', '2023-06-07');
INSERT INTO public.invoices VALUES ('ef805fbb-a110-4396-ae2a-ca1bdbb89d8d', '3958dc9e-712f-4377-85e9-fec4b6a6442a', 500, 'paid', '2023-08-19');
INSERT INTO public.revenue VALUES ('Jan', 2000);
INSERT INTO public.revenue VALUES ('Jul', 3500);
INSERT INTO public.revenue VALUES ('Aug', 3700);
INSERT INTO public.revenue VALUES ('Sep', 2500);
INSERT INTO public.revenue VALUES ('Oct', 2800);
INSERT INTO public.revenue VALUES ('Nov', 3000);
INSERT INTO public.revenue VALUES ('Dec', 4800);
INSERT INTO public.revenue VALUES ('Mar', 2200);
INSERT INTO public.revenue VALUES ('May', 2300);
INSERT INTO public.revenue VALUES ('Feb', 1800);
INSERT INTO public.revenue VALUES ('Apr', 2500);
INSERT INTO public.revenue VALUES ('Jun', 3200);
INSERT INTO public.users VALUES ('410544b2-4001-4271-9855-fec4b6a6442a', 'User', 'user@nextmail.com', '$2b$10$CHf3VICRdjYv4khmQovUYu6Bp8/wclitVfUfOuamAJ7/qC7BF.N86');
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.revenue
    ADD CONSTRAINT revenue_month_key UNIQUE (month);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
