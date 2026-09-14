import type {CatalogEntry, FreeGiftRule} from "./logic";

const PRISMIC_API_URL = "https://activeskin-gatsby.cdn.prismic.io/api/v2";

type PrismicProduct = {
  variants?: Array<{admin_graphql_api_id?: string}>;
};

type PrismicDocument = {
  id: string;
  data?: {
    status?: unknown;
    start_date?: string;
    end_date?: string;
    free_gift_group?: Array<{free_gift_product?: PrismicProduct}>;
    products?: Array<{product?: PrismicProduct}>;
    brand?: {id?: string};
    category?: {id?: string};
    minimum_cart_value?: unknown;
    minimum_product_count?: unknown;
  };
};

type StorefrontCatalogData = {
  nodes: Array<{
    id: string;
    price: {amount: string};
  } | null>;
};

type StorefrontQuery = <Data = unknown, Variables = Record<string, unknown>>(
  query: string,
  options?: {variables?: Variables},
) => Promise<{data?: Data; errors?: Array<{message: string}>}>;

export async function fetchPrismicRules(
  ruleIds: string[],
  accessToken: string,
): Promise<Map<string, FreeGiftRule>> {
  const api = new URL(PRISMIC_API_URL);
  api.searchParams.set("access_token", accessToken);
  const repository: {
    refs?: Array<{ref: string; isMasterRef?: boolean}>;
  } = await fetchJson(api);
  const ref =
    repository.refs?.find((item) => item.isMasterRef)?.ref ??
    repository.refs?.[0]?.ref;
  if (!ref) throw new Error("Prismic master ref was not found");

  const search = new URL(`${PRISMIC_API_URL}/documents/search`);
  search.searchParams.set("ref", ref);
  search.searchParams.set("page", "1");
  search.searchParams.set("pageSize", "100");
  search.searchParams.set(
    "q",
    `[[at(document.type, "rule")][in(document.id, ${JSON.stringify(ruleIds)})]]`,
  );
  search.searchParams.set("access_token", accessToken);

  const response: {results?: PrismicDocument[]} = await fetchJson(search);
  return new Map(
    (response.results ?? []).map((document) => [
      document.id,
      normalizePrismicRule(document),
    ]),
  );
}

export async function fetchCatalogEntries(
  variantIds: string[],
  queryStorefront: StorefrontQuery,
): Promise<Map<string, CatalogEntry>> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return new Map();

  const response = await queryStorefront<StorefrontCatalogData, {ids: string[]}>(
    `query FreeGiftValidationProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          price { amount }
        }
      }
    }`,
    {variables: {ids}},
  );

  if (response.errors?.length) {
    throw new Error(response.errors.map((error) => error.message).join("; "));
  }

  return new Map(
    (response.data?.nodes ?? [])
      .filter(
        (variant): variant is NonNullable<typeof variant> => variant != null,
      )
      .map((variant) => {
        return [variant.id, {price: Number(variant.price.amount)}];
      }),
  );
}

export function normalizePrismicRule(document: PrismicDocument): FreeGiftRule {
  const data = document.data ?? {};
  return {
    id: document.id,
    enabled: Boolean(data.status),
    startDate: data.start_date || null,
    endDate: data.end_date || null,
    giftVariantIds: collectFirstVariantIds(
      (data.free_gift_group ?? []).map((item) => item.free_gift_product),
    ),
    eligibleVariantIds: collectVariantIds(
      (data.products ?? []).map((item) => item.product),
    ),
    usesCollectionSelector: Boolean(data.brand?.id || data.category?.id),
    minimumCartValue: toOptionalNumber(data.minimum_cart_value),
    minimumProductCount: toOptionalNumber(data.minimum_product_count),
  };
}

function collectVariantIds(products: Array<PrismicProduct | undefined>) {
  return [
    ...new Set(
      products.flatMap((product) =>
        (product?.variants ?? [])
          .map((variant) => variant?.admin_graphql_api_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
}

function collectFirstVariantIds(products: Array<PrismicProduct | undefined>) {
  return [
    ...new Set(
      products
        .map((product) => product?.variants?.[0]?.admin_graphql_api_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

function toOptionalNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchJson(url: URL): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Prismic request failed with status ${response.status}`);
  }
  return response.json();
}
