import type { Schema, Struct } from '@strapi/strapi';

export interface BlogAuthorSocialLinks extends Struct.ComponentSchema {
  collectionName: 'components_blog_author_social_links';
  info: {
    displayName: 'AuthorSocialLinks';
  };
  attributes: {
    socialPlatform: Schema.Attribute.String;
    socialPlatformUrl: Schema.Attribute.String;
  };
}

export interface BlogBlogContent extends Struct.ComponentSchema {
  collectionName: 'components_blog_blog_contents';
  info: {
    displayName: 'blogContent';
  };
  attributes: {
    blogContents: Schema.Attribute.Blocks;
    blogImageContent: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    blogTableContent: Schema.Attribute.RichText;
    newTestContent: Schema.Attribute.RichText;
  };
}

export interface BlogBlogTableOfContent extends Struct.ComponentSchema {
  collectionName: 'components_blog_blog_table_of_contents';
  info: {
    displayName: 'blogTableOfContent';
  };
  attributes: {
    anchorLink: Schema.Attribute.String;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface IndustryAddress extends Struct.ComponentSchema {
  collectionName: 'components_industry_addresses';
  info: {
    displayName: 'address';
  };
  attributes: {
    city: Schema.Attribute.String;
    country: Schema.Attribute.String;
    pin: Schema.Attribute.Integer;
    state: Schema.Attribute.String;
  };
}

export interface IndustryIndustry extends Struct.ComponentSchema {
  collectionName: 'components_industry_industries';
  info: {
    displayName: 'Industry';
  };
  attributes: {};
}

export interface IndustryParentIndustry extends Struct.ComponentSchema {
  collectionName: 'components_industry_parent_industries';
  info: {
    displayName: 'ParentIndustry';
  };
  attributes: {};
}

export interface IndustryRank extends Struct.ComponentSchema {
  collectionName: 'components_industry_ranks';
  info: {
    displayName: 'rank';
  };
  attributes: {};
}

export interface IndustryRanking extends Struct.ComponentSchema {
  collectionName: 'components_industry_rankings';
  info: {
    displayName: 'ranking';
  };
  attributes: {};
}

export interface ServiceCategoryBenefitEmail extends Struct.ComponentSchema {
  collectionName: 'components_service_category_benefit_emails';
  info: {
    displayName: 'benefitEmail';
  };
  attributes: {
    iconBox: Schema.Attribute.Component<'service-category.icon-box', true>;
    sectionDescription: Schema.Attribute.Text;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryBusinessExpansion
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_business_expansions';
  info: {
    displayName: 'businessExpansion';
  };
  attributes: {
    sectionCta: Schema.Attribute.Component<'service-category.button', false>;
    sectionImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    sectionPara: Schema.Attribute.Blocks;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryButton extends Struct.ComponentSchema {
  collectionName: 'components_service_category_buttons';
  info: {
    displayName: 'button';
  };
  attributes: {
    buttonLabel: Schema.Attribute.String;
    buttonURL: Schema.Attribute.Text;
  };
}

export interface ServiceCategoryCategoryBanner extends Struct.ComponentSchema {
  collectionName: 'components_service_category_category_banners';
  info: {
    displayName: 'category-banner';
  };
  attributes: {
    bannerDescription: Schema.Attribute.Text;
    bannerTitle: Schema.Attribute.String;
    button: Schema.Attribute.Component<'service-category.button', true>;
    currentCountry: Schema.Attribute.String;
    currentCountryCount: Schema.Attribute.BigInteger;
    currentCountryImg: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    worldWide: Schema.Attribute.String;
    worldWideCount: Schema.Attribute.Text;
    worldWideImg: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
  };
}

export interface ServiceCategoryClientForm extends Struct.ComponentSchema {
  collectionName: 'components_service_category_client_forms';
  info: {
    displayName: 'clientForm';
  };
  attributes: {
    clientForm: Schema.Attribute.String;
  };
}

export interface ServiceCategoryCountryDetails extends Struct.ComponentSchema {
  collectionName: 'components_service_category_country_details';
  info: {
    displayName: 'countryDetails';
  };
  attributes: {
    countryCode: Schema.Attribute.BigInteger;
    countryFlag: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    countryName: Schema.Attribute.String;
  };
}

export interface ServiceCategoryCountrySection extends Struct.ComponentSchema {
  collectionName: 'components_service_category_country_sections';
  info: {
    displayName: 'countrySection';
  };
  attributes: {
    countryDetails: Schema.Attribute.Component<
      'service-category.country-details',
      true
    >;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryDataVerification
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_data_verifications';
  info: {
    displayName: 'dataVerification';
  };
  attributes: {
    dataVerificationItem: Schema.Attribute.Component<
      'service-category.data-verificatoin-items',
      true
    >;
  };
}

export interface ServiceCategoryDataVerificatoinItems
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_data_verificatoin_items';
  info: {
    displayName: 'dataVerificatoinItems';
  };
  attributes: {
    verificationImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    verificationTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryDynamicOpenRates
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_dynamic_open_rates';
  info: {
    displayName: 'dynamicOpenRates';
  };
  attributes: {
    categorySector: Schema.Attribute.String;
    percentageRate: Schema.Attribute.String;
  };
}

export interface ServiceCategoryEmailFormatSection
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_email_format_sections';
  info: {
    displayName: 'emailFormatSection';
  };
  attributes: {
    button: Schema.Attribute.Component<'service-category.button', false>;
    emailFormats: Schema.Attribute.Component<
      'service-category.email-formats-to-note',
      true
    >;
    linkButton: Schema.Attribute.Component<'service-category.button', false>;
    sectionDescription: Schema.Attribute.Text;
    sectionimage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    sectionPara: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface ServiceCategoryEmailFormatsToNote
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_email_formats_to_notes';
  info: {
    displayName: 'emailFormatsToNote';
  };
  attributes: {
    Format: Schema.Attribute.String;
  };
}

export interface ServiceCategoryEmailOpenRates extends Struct.ComponentSchema {
  collectionName: 'components_service_category_email_open_rates';
  info: {
    displayName: 'emailOpenRates';
  };
  attributes: {
    openRates: Schema.Attribute.Component<
      'service-category.dynamic-open-rates',
      true
    >;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryExclusiveEmail extends Struct.ComponentSchema {
  collectionName: 'components_service_category_exclusive_emails';
  info: {
    displayName: 'exclusiveEmail';
  };
  attributes: {
    button: Schema.Attribute.Component<'service-category.button', false>;
    features: Schema.Attribute.JSON;
    sectionHyper: Schema.Attribute.Blocks;
    sectionImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    sectionPara: Schema.Attribute.Text;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryFaqS extends Struct.ComponentSchema {
  collectionName: 'components_service_category_faq_s';
  info: {
    displayName: "faq's";
  };
  attributes: {
    Answer: Schema.Attribute.Text;
    Question: Schema.Attribute.String;
  };
}

export interface ServiceCategoryFaqSection extends Struct.ComponentSchema {
  collectionName: 'components_service_category_faq_sections';
  info: {
    displayName: 'faqSection';
  };
  attributes: {
    faq: Schema.Attribute.Component<'service-category.faq-s', true>;
  };
}

export interface ServiceCategoryIconBox extends Struct.ComponentSchema {
  collectionName: 'components_service_category_icon_boxes';
  info: {
    displayName: 'iconBox';
  };
  attributes: {
    cardDescription: Schema.Attribute.String;
    cardTitle: Schema.Attribute.String;
    icon: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
  };
}

export interface ServiceCategoryIndustries extends Struct.ComponentSchema {
  collectionName: 'components_service_category_industries';
  info: {
    displayName: 'industries';
  };
  attributes: {
    icon: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    industryName: Schema.Attribute.String;
  };
}

export interface ServiceCategoryIndustriesCovered
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_industries_covereds';
  info: {
    displayName: 'industries-covered';
  };
  attributes: {
    industriesCovered: Schema.Attribute.Component<
      'service-category.industries',
      true
    >;
    sectionDescription: Schema.Attribute.Text;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryInfiniteContent extends Struct.ComponentSchema {
  collectionName: 'components_service_category_infinite_contents';
  info: {
    displayName: 'infiniteContent';
  };
  attributes: {
    fieldName: Schema.Attribute.String;
    fieldUrl: Schema.Attribute.String;
  };
}

export interface ServiceCategoryInstantAccess extends Struct.ComponentSchema {
  collectionName: 'components_service_category_instant_accesses';
  info: {
    displayName: 'instantAccess';
  };
  attributes: {
    button: Schema.Attribute.Component<'service-category.button', false>;
    sectionDescription: Schema.Attribute.Text;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryPowerPackedSection
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_power_packed_sections';
  info: {
    displayName: 'power-packed-section';
  };
  attributes: {
    containerText: Schema.Attribute.Text;
    descriptionParaText: Schema.Attribute.Blocks;
    heading: Schema.Attribute.String;
    Lottie: Schema.Attribute.JSON;
    powerButton: Schema.Attribute.Component<'service-category.button', false>;
    VideoAKALottie: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
  };
}

export interface ServiceCategoryPowerpackInfinity
  extends Struct.ComponentSchema {
  collectionName: 'components_service_category_powerpack_infinities';
  info: {
    displayName: 'powerpackInfinity';
  };
  attributes: {
    infSecContent: Schema.Attribute.Component<
      'service-category.infinite-content',
      true
    >;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryRoiComponents extends Struct.ComponentSchema {
  collectionName: 'components_service_category_roi_components';
  info: {
    displayName: 'roiComponents';
  };
  attributes: {
    componentIcon: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    componentTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryRoiSection extends Struct.ComponentSchema {
  collectionName: 'components_service_category_roi_sections';
  info: {
    displayName: 'roiSection';
  };
  attributes: {
    button: Schema.Attribute.Component<'service-category.button', false>;
    roiComponents: Schema.Attribute.Component<
      'service-category.roi-components',
      true
    >;
    sectionDescription: Schema.Attribute.Text;
    sectionLinkDescription: Schema.Attribute.Blocks;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface ServiceCategoryVideoSection extends Struct.ComponentSchema {
  collectionName: 'components_service_category_video_sections';
  info: {
    displayName: 'videoSection';
  };
  attributes: {
    videoUrl: Schema.Attribute.Text;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'blog.author-social-links': BlogAuthorSocialLinks;
      'blog.blog-content': BlogBlogContent;
      'blog.blog-table-of-content': BlogBlogTableOfContent;
      'industry.address': IndustryAddress;
      'industry.industry': IndustryIndustry;
      'industry.parent-industry': IndustryParentIndustry;
      'industry.rank': IndustryRank;
      'industry.ranking': IndustryRanking;
      'service-category.benefit-email': ServiceCategoryBenefitEmail;
      'service-category.business-expansion': ServiceCategoryBusinessExpansion;
      'service-category.button': ServiceCategoryButton;
      'service-category.category-banner': ServiceCategoryCategoryBanner;
      'service-category.client-form': ServiceCategoryClientForm;
      'service-category.country-details': ServiceCategoryCountryDetails;
      'service-category.country-section': ServiceCategoryCountrySection;
      'service-category.data-verification': ServiceCategoryDataVerification;
      'service-category.data-verificatoin-items': ServiceCategoryDataVerificatoinItems;
      'service-category.dynamic-open-rates': ServiceCategoryDynamicOpenRates;
      'service-category.email-format-section': ServiceCategoryEmailFormatSection;
      'service-category.email-formats-to-note': ServiceCategoryEmailFormatsToNote;
      'service-category.email-open-rates': ServiceCategoryEmailOpenRates;
      'service-category.exclusive-email': ServiceCategoryExclusiveEmail;
      'service-category.faq-s': ServiceCategoryFaqS;
      'service-category.faq-section': ServiceCategoryFaqSection;
      'service-category.icon-box': ServiceCategoryIconBox;
      'service-category.industries': ServiceCategoryIndustries;
      'service-category.industries-covered': ServiceCategoryIndustriesCovered;
      'service-category.infinite-content': ServiceCategoryInfiniteContent;
      'service-category.instant-access': ServiceCategoryInstantAccess;
      'service-category.power-packed-section': ServiceCategoryPowerPackedSection;
      'service-category.powerpack-infinity': ServiceCategoryPowerpackInfinity;
      'service-category.roi-components': ServiceCategoryRoiComponents;
      'service-category.roi-section': ServiceCategoryRoiSection;
      'service-category.video-section': ServiceCategoryVideoSection;
    }
  }
}
