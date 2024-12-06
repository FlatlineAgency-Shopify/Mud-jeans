// Initialize headers inside the function
const headers = new Headers({
  "Content-Type": "application/json",
  "X-Project-Access-Token": "j9vGewH3AmrcqweUmaPJb6e5",
});

const fetchProductByShopifyVariantId = async (shopifyVariantId) => {
  const graphql = JSON.stringify({
    query: `query products($after: String, $first: Int, $shopifyVariantId: String){
    products(after: $after, first: $first, shopifyVariantId: $shopifyVariantId) {
        nodes {
            id
            productType
            shopifyVariantId
        }
    }
}
`,
    variables: {
      after: null,
      first: 10,
      shopifyVariantId: shopifyVariantId,
    },
  });

  const requestOptions = {
    method: "POST",
    headers,
    body: graphql,
  };

  try {
    // Perform fetch with query and variables
    const response = await fetch(
      "https://portal.firmhouse.com/graphql",
      requestOptions
    );

    // Parse the response
    const responseBody = await response.json();

    // Check for response status
    if (response.ok) {
      return responseBody.data;
    } else {
      console.error("Error fetching product:", responseBody.errors);
      throw new Error(responseBody.errors);
    }
  } catch (error) {
    console.error("Fetch error:", error);
    throw error; // Rethrow the error to allow calling code to handle it
  }
};

const handleFirmHouseCheckout = async () => {
  fetch("/cart.js")
    .then((response) => response.json())
    .then(async (cart) => {
      if (cart.items.length === 0) {
        console.warn("Cart is empty");
        return;
      }

      try {
        const item_skus = await Promise.all(
          cart.items.map(async (item) => {
            const data = await fetchProductByShopifyVariantId(
              `gid://shopify/ProductVariant/${item.variant_id}`
            );
            const { nodes: products } = data.products;

            // Determine product type based on lease condition
            const selectedProduct =
              item.properties.lease_text === "lease"
                ? products.find((x) => x.productType === "recurring")
                : products.find((x) => x.productType === "one_time_purchase");

            // Return the object that will be pushed into item_skus array
            return {
              id: selectedProduct ? selectedProduct.id : null, // Handle case where no product is found
              sku: item.sku,
              quantity: item.quantity,
              isLease: item.properties.lease_text === "lease",
              price: item.line_price,
            };
          })
        );

        if (item_skus.length > 0) {
          addToCartFH(item_skus);
        }
      } catch (error) {
        console.error("Error fetching product:", error);
      }
    })
    .catch((error) => console.error("Error fetching cart:", error));
};

const createCart = async () => {
  const graphql = JSON.stringify({
    query: `mutation {
    createCart(input: {}){
        subscription {
            token
        }
    }
}
`,
  });

  const requestOptions = {
    method: "POST",
    headers,
    body: graphql,
  };

  const response = await fetch(
    "https://portal.firmhouse.com/graphql",
    requestOptions
  );

  const body = await response.json();

  const subscriptionToken = body.data.createCart.subscription.token;
  return subscriptionToken;
};

const addToCartFH = async (productIds) => {
  const subscriptionToken = await createCart();

  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Project-Access-Token": "j9vGewH3AmrcqweUmaPJb6e5",
    "X-Subscription-Token": subscriptionToken,
  });



  for (const productId of productIds) {
    
    const input = {
      productId: productId.id,
      quantity: productId.quantity ?? 1,
    };

    const graphql = JSON.stringify({
      query: `mutation CreateOrderedProduct($input: CreateOrderedProductInput!) {
        createOrderedProduct(input: $input) {
          errors
          orderedProduct {
            createdAt
            graceCancellationEndsAt
            id
            interval
            intervalUnitOfMeasure
            maximumCommitmentEndsAt
            metadata
            minimumCommitmentEndsAt
            priceExcludingTaxCents
            priceIncludingTaxCents
            productId
            quantity
            recurring
            shipmentDate
            status
            title
            totalAmountExcludingTaxCents
            totalAmountIncludingTaxCents
            totalOrdered
            updatedAt
            product {
              id
              sku
            }
          }
          subscription {
            amountForStartingSubscriptionCents
            currency
            metadata
            monthlyAmount
            monthlyAmountCents
            checkoutUrl
            orderedProducts {
              createdAt
              graceCancellationEndsAt
              id
              interval
              intervalUnitOfMeasure
              maximumCommitmentEndsAt
              metadata
              minimumCommitmentEndsAt
              priceExcludingTaxCents
              priceIncludingTaxCents
              productId
              quantity
              recurring
              status
              title
              totalAmountExcludingTaxCents
              totalAmountIncludingTaxCents
              totalOrdered
              updatedAt
            }
          }
        }
      }`,
      variables: {
        input,
      },
    });

    const requestOptions = {
      method: "POST",
      headers,
      body: graphql,
    };

    const response = await fetch(
      "https://portal.firmhouse.com/graphql",
      requestOptions
    );
    const data = await response.json();

    if (data.errors) {
      console.log("leasebtn error >>", data.errors[0].message);
    }
  }

  // After all products are added to the cart, redirect to the checkout URL of the last product added
  const finalResponse = await fetch("https://portal.firmhouse.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `query GetSubscription($token: ID!) {
        getSubscription(token: $token) {
            checkoutUrl
        }
    }
`,
      variables: {
        token: subscriptionToken,
      },
    }),
  });  

  const finalData = await finalResponse.json();
  const checkoutUrl = finalData.data.getSubscription.checkoutUrl;
  window.location.assign(checkoutUrl);
};
