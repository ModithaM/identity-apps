/**
 * Copyright (c) 2023-2025, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useRequiredScopes } from "@wso2is/access-control";
import { AppConstants } from "@wso2is/admin.core.v1/constants/app-constants";
import { history } from "@wso2is/admin.core.v1/helpers/history";
import { FeatureConfigInterface } from "@wso2is/admin.core.v1/models/config";
import { AppState } from "@wso2is/admin.core.v1/store";
import { SharedUserStoreUtils } from "@wso2is/admin.core.v1/utils/user-store-utils";
import { SCIMConfigs, userstoresConfig } from "@wso2is/admin.extensions.v1";
import { PatchRoleDataInterface } from "@wso2is/admin.roles.v2/models/roles";
import {
    ConnectorPropertyInterface,
    ServerConfigurationsConstants
} from "@wso2is/admin.server-configurations.v1";
import {
    AdminForcedPasswordResetOption
} from "@wso2is/admin.server-configurations.v1/models/admin-forced-password-reset";
import { useUserStoreRegEx } from "@wso2is/admin.userstores.v1/api/use-get-user-store-regex";
import { USERSTORE_REGEX_PROPERTIES } from "@wso2is/admin.userstores.v1/constants/user-store-constants";
import { useValidationConfigData } from "@wso2is/admin.validation.v1/api";
import { ValidationFormInterface } from "@wso2is/admin.validation.v1/models";
import { IdentityAppsApiException } from "@wso2is/core/exceptions";
import { AlertInterface, AlertLevels, ProfileInfoInterface, TestableComponentInterface } from "@wso2is/core/models";
import { CommonUtils } from "@wso2is/core/utils";
import { Field, FormValue, Forms, RadioChild, Validation, useTrigger } from "@wso2is/forms";
import { LinkButton, Message, PasswordValidation, PrimaryButton } from "@wso2is/react-components";
import React,
{
    FunctionComponent,
    ReactElement,
    ReactNode,
    useEffect,
    useMemo,
    useState
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Grid, Icon, Modal, SemanticCOLORS } from "semantic-ui-react";
import { updateUserInfo } from "../api";
import { getConfiguration } from "../utils";

/**
 * Prop types for the change user password component.
 */
interface ChangePasswordPropsInterface extends TestableComponentInterface {
    /**
     * Handle closing the change password modal.
     */
    handleCloseChangePasswordModal: () => void;
    /**
     * Show or hide the change password modal.
     */
    openChangePasswordModal: boolean;
    /**
     * On alert fired callback.
     */
    onAlertFired: (alert: AlertInterface) => void;
    /**
     * User profile
     */
    user: ProfileInfoInterface;
    /**
     * Handle user update callback.
     */
    handleUserUpdate: (userId: string) => void;
    /**
     * Password reset connector properties
     */
    connectorProperties: ConnectorPropertyInterface[];
    /**
     * Handles force password reset trigger.
     */
    handleForcePasswordResetTrigger?: () => void;
    /**
     * Flag to identify if this is a password reset operation.
     * When false, it indicates that a new password is being set (Usage: in the ask password flow).
     */
    isResetPassword?: boolean;
}

/**
 * Change user password component.
 *
 * @param props - Props injected to the change user password component.
 * @returns ChangePasswordComponent
 */
export const ChangePasswordComponent: FunctionComponent<ChangePasswordPropsInterface> = (
    props: ChangePasswordPropsInterface
): ReactElement => {

    const {
        onAlertFired,
        user,
        handleUserUpdate,
        openChangePasswordModal,
        handleCloseChangePasswordModal,
        connectorProperties,
        handleForcePasswordResetTrigger,
        isResetPassword = true,
        [ "data-testid" ]: testId
    } = props;

    const { t } = useTranslation();

    const [ passwordConfig, setPasswordConfig ] = useState<ValidationFormInterface>(undefined);
    const [ isPasswordPatternValid, setIsPasswordPatternValid ] = useState<boolean>(true);
    const [ isConfirmPasswordMatch, setIsConfirmPasswordMatch ] = useState<boolean>(undefined);
    const [ password, setPassword ] = useState<string>("");
    const [ passwordResetOption, setPasswordResetOption ] = useState("setPassword");
    const [ adminForcedPasswordResetOption, setAdminForcedPasswordResetOption ]
        = useState(AdminForcedPasswordResetOption.EMAIL_LINK);
    const [ triggerSubmit, setTriggerSubmit ] = useTrigger();
    const [
        governanceConnectorProperties,
        setGovernanceConnectorProperties
    ] = useState<ConnectorPropertyInterface[]>(undefined);
    const [ isForcePasswordResetEnable, setIsForcePasswordResetEnable ] = useState<boolean>(false);

    const [ isSubmitting, setIsSubmitting ] = useState<boolean>(false);

    const featureConfig: FeatureConfigInterface = useSelector((state: AppState) => state.config.ui.features);

    const hasLoginAndRegistrationFeaturePermissions: boolean = useRequiredScopes(
        featureConfig?.loginAndRegistration?.scopes?.feature
    );

    const {
        data: validationConfig
    } = useValidationConfigData();

    const userStore: string = useMemo(() => {
        const userNameComponents: string[] = user?.userName?.split("/");

        return userNameComponents?.length > 1 ? userNameComponents[0] : userstoresConfig.primaryUserstoreName;
    }, [ user ]);

    const {
        data: userStorePasswordRegEx,
        isLoading: isUserStorePasswordRegExLoading
    } = useUserStoreRegEx(
        userStore,
        USERSTORE_REGEX_PROPERTIES.PasswordRegEx
    );

    /**
     * Retrieve the password validation configuration from the validation data.
     */
    useEffect(() => {
        if (validationConfig) {
            setPasswordConfig(getConfiguration(validationConfig));
        }
    }, [ validationConfig ]);

    useEffect(() => {
        if (!connectorProperties) {
            return;
        }

        if (governanceConnectorProperties === undefined
            || governanceConnectorProperties?.length !== connectorProperties?.length) {
            setGovernanceConnectorProperties(connectorProperties);
        }
    }, [ connectorProperties ]);

    useEffect(() => {

        if (governanceConnectorProperties &&
            Array.isArray(governanceConnectorProperties) &&
            governanceConnectorProperties?.length > 0) {

            let isEmailLinkEnabled: boolean = false;
            let isEmailOtpEnabled: boolean = false;
            let isSmsOtpEnabled: boolean = false;

            for (const property of governanceConnectorProperties) {
                if (property.name === ServerConfigurationsConstants.ADMIN_FORCE_PASSWORD_RESET_EMAIL_LINK) {
                    isEmailLinkEnabled = CommonUtils.parseBoolean(property.value);
                } else if (property.name === ServerConfigurationsConstants.ADMIN_FORCE_PASSWORD_RESET_EMAIL_OTP) {
                    isEmailOtpEnabled = CommonUtils.parseBoolean(property.value);
                } else if( property.name === ServerConfigurationsConstants.ADMIN_FORCE_PASSWORD_RESET_SMS_OTP) {
                    isSmsOtpEnabled = CommonUtils.parseBoolean(property.value);
                }
            }

            setIsForcePasswordResetEnable(isEmailLinkEnabled || isEmailOtpEnabled || isSmsOtpEnabled);
            let resetOption: AdminForcedPasswordResetOption = AdminForcedPasswordResetOption.EMAIL_LINK;

            if (isSmsOtpEnabled) {
                resetOption = AdminForcedPasswordResetOption.SMS_OTP;
            } else if (isEmailOtpEnabled) {
                resetOption = AdminForcedPasswordResetOption.EMAIL_OTP;
            }
            setAdminForcedPasswordResetOption(resetOption);
        }
    }, [ governanceConnectorProperties ]);

    const handleModalClose = () => {
        setPassword("");
        setPasswordResetOption("setPassword");
        setIsConfirmPasswordMatch(undefined);
    };

    const passwordResetOptions: RadioChild[] = [
        {
            label: t("user:modals.changePasswordModal.passwordOptions.setPassword"),
            value: "setPassword"
        },
        {
            label: t("user:modals.changePasswordModal.passwordOptions.forceReset"),
            value: "forceReset"
        }
    ];

    /**
     * Handle admin initiated password reset.
     */
    const handleForcePasswordReset = () => {
        if (!isForcePasswordResetEnable) {
            onAlertFired({
                description: t(
                    "user:profile.notifications.noPasswordResetOptions.error.description"
                ),
                level: AlertLevels.WARNING,
                message: t(
                    "user:profile.notifications.noPasswordResetOptions.error.message"
                )
            });

            return;
        }

        const schemaURI: string = SCIMConfigs.scim.systemSchema;

        const data: PatchRoleDataInterface = {
            "Operations": [
                {
                    "op": "add",
                    "value": {
                        [ schemaURI ]: {
                            "forcePasswordReset": true
                        }
                    }
                }
            ],
            "schemas": [ "urn:ietf:params:scim:api:messages:2.0:PatchOp" ]
        };

        setIsSubmitting(true);

        updateUserInfo(user.id, data).then(() => {
            onAlertFired({
                description: t(
                    "user:profile.notifications.forcePasswordReset.success.description"
                ),
                level: AlertLevels.SUCCESS,
                message: t(
                    "user:profile.notifications.forcePasswordReset.success.message"
                )
            });
            handleForcePasswordResetTrigger && handleForcePasswordResetTrigger();
            handleModalClose();
            handleCloseChangePasswordModal();
            handleUserUpdate(user.id);
        })
            .catch((error: IdentityAppsApiException) => {
                if (error.response && error.response.data && error.response.data.description) {
                    onAlertFired({
                        description: error.response.data.description,
                        level: AlertLevels.ERROR,
                        message: t("user:profile.notifications.forcePasswordReset.error." +
                            "message")
                    });

                    return;
                }

                onAlertFired({
                    description: t("user:profile.notifications.forcePasswordReset." +
                        "genericError.description"),
                    level: AlertLevels.ERROR,
                    message: t("user:profile.notifications.forcePasswordReset.genericError." +
                        "message")
                });
                handleModalClose();
                handleCloseChangePasswordModal();
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    const handleLoginAndRegistrationPageRedirect = () => {
        history.push(AppConstants.getPaths().get("GOVERNANCE_CONNECTOR_EDIT")
            .replace(":categoryId",
                ServerConfigurationsConstants.ACCOUNT_MANAGEMENT_CATEGORY_ID)
            .replace(":connectorId",
                ServerConfigurationsConstants.ADMIN_FORCED_PASSWORD_RESET));
    };

    const resolveConfigurationList = (): ReactNode => {
        if (isForcePasswordResetEnable) {
            const warningMessage: string = "extensions:manage.users.editUserProfile.resetPassword.changePasswordModal."
            + "emailResetWarning." + adminForcedPasswordResetOption.toString();

            return (
                <Grid.Row>
                    <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                        <Message
                            hideDefaultIcon
                            icon={ adminForcedPasswordResetOption === AdminForcedPasswordResetOption.SMS_OTP
                                ? "mobile" : "mail" }
                            content=
                                {
                                    t(warningMessage)
                                }
                        />
                    </Grid.Column>
                </Grid.Row>
            );
        }

        return (
            <Grid.Row>
                <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                    <Message
                        hideDefaultIcon
                        error
                        content={
                            (
                                <>
                                    <Icon color="red" name="times circle" />
                                    <Trans
                                        i18nKey={ "extensions:manage.users.editUserProfile.resetPassword." +
                                            "changePasswordModal.passwordResetConfigDisabled" }>
                                        Password reset via recovery email is not enabled.
                                        Please make sure to enable it from
                                        {
                                            hasLoginAndRegistrationFeaturePermissions
                                                ? (
                                                    <a
                                                        onClick={ handleLoginAndRegistrationPageRedirect }
                                                        className="ml-1 external-link link pointing primary"
                                                    >
                                                        Login and Registration
                                                    </a>
                                                ) : "Login and Registration"
                                        } configurations
                                    </Trans>
                                </>
                            )
                        }
                    />
                </Grid.Column>
            </Grid.Row>
        );
    };

    /**
     * Callback function to validate password.
     *
     * @param isValid - validation status.
     */
    const onPasswordValidate = (isValid: boolean): void => {
        setIsPasswordPatternValid(isValid);
    };

    /**
     * Check whether the new password and confirm password match.
     *
     * @param newPassword - New password entered by the user.
     * @param confirmPassword - Confirm password entered by the user.
     * @returns boolean | undefined
     */
    const checkPasswordsMatch = (
        newPassword: string | undefined,
        confirmPassword: string | undefined
    ): boolean | undefined => {
        if (!newPassword || !confirmPassword) return undefined;

        return newPassword === confirmPassword;
    };

    /**
     * The following function handles the change of the password.
     *
     * @param values - values of form field
     */
    const handlePasswordChange = (values: Map<string, FormValue>): void => {
        const newPassword: string = values?.get("newPassword")?.toString() || "";
        const confirmPassword: string | undefined = values?.get("confirmPassword")?.toString();

        setPassword(newPassword);

        setIsConfirmPasswordMatch(checkPasswordsMatch(newPassword, confirmPassword));
    };

    /**
     * Verify whether the provided password is valid.
     *
     * @param password - The password to validate.
     */
    const isNewPasswordValid = (password: string) => {
        if (passwordConfig) {
            return isPasswordPatternValid;
        }

        return SharedUserStoreUtils.validateInputAgainstRegEx(password, userStorePasswordRegEx);
    };

    /**
     * Validate password and display an error message when the password is invalid.
     *
     * @param value - The value of the password field.
     * @param validation - The validation object.
     */
    const validateNewPassword = (value: string, validation: Validation) => {
        if (!isNewPasswordValid(value)) {
            validation.isValid = false;
            validation?.errorMessages?.push(passwordConfig ?
                t(
                    "extensions:manage.features.user.addUser.validation.error.passwordValidation"
                ) : t(
                    "extensions:manage.features.user.addUser.validation.password"
                ));
        }
    };

    /**
     * The following method returns the password reset form fields.
     */
    const passwordFormFields = () => {
        return (
            <>
                <Grid.Row>
                    <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                        <Field
                            data-testid="user-mgt-edit-user-form-newPassword-input"
                            className="addon-field-wrapper"
                            hidePassword={ t("common:hidePassword") }
                            label={ t(
                                "user:forms.addUserForm.inputs.newPassword.label"
                            ) }
                            name="newPassword"
                            placeholder={ t(
                                "user:forms.addUserForm.inputs." +
                                "newPassword.placeholder"
                            ) }
                            required={ true }
                            requiredErrorMessage={ t(
                                "user:forms.addUserForm." +
                                "inputs.newPassword.validations.empty"
                            ) }
                            showPassword={ t("common:showPassword") }
                            type="password"
                            value=""
                            listen={ handlePasswordChange }
                            loading={ isUserStorePasswordRegExLoading }
                            validation={ validateNewPassword }
                        />
                        { passwordConfig && (
                            <PasswordValidation
                                password={ password }
                                minLength={ Number(passwordConfig?.minLength) }
                                maxLength={ Number(passwordConfig?.maxLength) }
                                minNumbers={ Number(passwordConfig?.minNumbers) }
                                minUpperCase={ Number(passwordConfig?.minUpperCaseCharacters) }
                                minLowerCase={ Number(passwordConfig?.minLowerCaseCharacters) }
                                minSpecialChr={ Number(passwordConfig?.minSpecialCharacters) }
                                minUniqueChr={ Number(passwordConfig?.minUniqueCharacters) }
                                maxConsecutiveChr={ Number(passwordConfig?.maxConsecutiveCharacters) }
                                onPasswordValidate={ onPasswordValidate }
                                translations={ {
                                    case: (Number(passwordConfig?.minUpperCaseCharacters) > 0 &&
                                        Number(passwordConfig?.minLowerCaseCharacters) > 0) ?
                                        t("extensions:manage.features.user.addUser.validation.passwordCase", {
                                            minLowerCase: passwordConfig?.minLowerCaseCharacters,
                                            minUpperCase: passwordConfig?.minUpperCaseCharacters
                                        }) : (
                                            Number(passwordConfig?.minUpperCaseCharacters) > 0 ?
                                                t("extensions:manage.features.user.addUser.validation.upperCase", {
                                                    minUpperCase: passwordConfig?.minUpperCaseCharacters
                                                }) : t("extensions:manage.features.user.addUser.validation" +
                                                    ".lowerCase", {
                                                    minLowerCase: passwordConfig?.minLowerCaseCharacters
                                                })
                                        ),
                                    consecutiveChr:
                                        t("extensions:manage.features.user.addUser.validation." +
                                            "consecutiveCharacters", {
                                            repeatedChr: passwordConfig?.maxConsecutiveCharacters
                                        }),
                                    length: t("extensions:manage.features.user.addUser.validation.passwordLength", {
                                        max: passwordConfig?.maxLength, min: passwordConfig?.minLength
                                    }),
                                    numbers:
                                        t("extensions:manage.features.user.addUser.validation.passwordNumeric", {
                                            min: passwordConfig?.minNumbers
                                        }),
                                    specialChr:
                                        t("extensions:manage.features.user.addUser.validation.specialCharacter", {
                                            specialChr: passwordConfig?.minSpecialCharacters
                                        }),
                                    uniqueChr:
                                        t("extensions:manage.features.user.addUser.validation.uniqueCharacters", {
                                            uniqueChr: passwordConfig?.minUniqueCharacters
                                        })
                                } }
                            />
                        ) }
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                        <Field
                            data-testid="user-mgt-edit-user-form-confirmPassword-input"
                            className="addon-field-wrapper"
                            hidePassword={ t("common:hidePassword") }
                            label={ t(
                                "user:forms.addUserForm.inputs.confirmPassword.label"
                            ) }
                            name="confirmPassword"
                            placeholder={ t(
                                "user:forms.addUserForm.inputs." +
                                "confirmPassword.placeholder"
                            ) }
                            required={ true }
                            requiredErrorMessage={ t(
                                "user:forms.addUserForm." +
                                "inputs.confirmPassword.validations.empty"
                            ) }
                            showPassword={ t("common:showPassword") }
                            type="password"
                            value=""
                            listen={ (values: Map<string, FormValue>): void => {
                                const newPassword: string | undefined = values?.get("newPassword")?.toString();
                                const confirmPassword: string | undefined = values?.get("confirmPassword")?.toString();

                                setIsConfirmPasswordMatch(checkPasswordsMatch(newPassword, confirmPassword));
                            } }
                            validation={
                                (value: string, validation: Validation, formValues: Map<string, FormValue>) => {
                                    const newPassword: string | undefined = formValues?.get("newPassword")?.toString();

                                    if (!checkPasswordsMatch(newPassword, value)) {
                                        validation.isValid = false;
                                        setIsConfirmPasswordMatch(false);
                                        validation?.errorMessages?.push(
                                            t("user:forms.addUserForm.inputs" +
                                            ".confirmPassword.validations.mismatch"));
                                    }
                                }
                            }
                        />
                        <div className="password-policy-description">
                            <Icon
                                className={
                                    isConfirmPasswordMatch === undefined
                                        ? "circle thin"
                                        : isConfirmPasswordMatch
                                            ? "check circle"
                                            : "remove circle"
                                }
                                color={
                                    isConfirmPasswordMatch === undefined
                                        ? "grey" as SemanticCOLORS
                                        : isConfirmPasswordMatch
                                            ? "green" as SemanticCOLORS
                                            : "red" as SemanticCOLORS
                                }
                                inverted
                            />
                            <p>{ t("extensions:manage.features.user.addUser.validation.confirmPassword") }</p>
                        </div>
                    </Grid.Column>
                </Grid.Row>
            </>
        );
    };

    /**
     * The following method handles the change of password reset option
     * and renders the relevant component accordingly.
     */
    const handlePasswordResetOptionChange = () => {
        if (passwordResetOption && passwordResetOption === "setPassword") {
            return passwordFormFields();
        } else {
            return resolveConfigurationList();
        }
    };

    const handleChangeUserPassword = (values: Map<string, string | string[]>): void => {

        const data: PatchRoleDataInterface = {
            "Operations": [
                {
                    "op": "replace",
                    "value": {
                        "password": values.get("newPassword").toString()
                    }
                }
            ],
            "schemas": [ "urn:ietf:params:scim:api:messages:2.0:PatchOp" ]
        };

        setIsSubmitting(true);

        updateUserInfo(user.id, data).then(() => {
            onAlertFired({
                description: t(
                    isResetPassword
                        ? "user:profile.notifications.changeUserPassword.success.description"
                        : "user:profile.notifications.setUserPassword.success.description"
                ),
                level: AlertLevels.SUCCESS,
                message: t(
                    isResetPassword
                        ? "user:profile.notifications.changeUserPassword.success.message"
                        : "user:profile.notifications.setUserPassword.success.message"
                )
            });
            handleCloseChangePasswordModal();
            handleModalClose();
            handleUserUpdate(user.id);
        })
            .catch((error: any) => {
                if (error.response && error.response.data && error.response.data.detail) {
                    onAlertFired({
                        description: t(
                            isResetPassword
                                ? "user:profile.notifications.changeUserPassword.error.description"
                                : "user:profile.notifications.setUserPassword.error.description",
                            { description: error.response.data.detail }
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            isResetPassword
                                ? "user:profile.notifications.changeUserPassword.error.message"
                                : "user:profile.notifications.setUserPassword.error.message"
                        )
                    });

                    return;
                }

                onAlertFired({
                    description: t(
                        isResetPassword
                            ? "user:profile.notifications.changeUserPassword.genericError.description"
                            : "user:profile.notifications.setUserPassword.genericError.description"
                    ),
                    level: AlertLevels.ERROR,
                    message: t(
                        isResetPassword
                            ? "user:profile.notifications.changeUserPassword.genericError.message"
                            : "user:profile.notifications.setUserPassword.genericError.message"
                    )
                });
                handleCloseChangePasswordModal();
                handleModalClose();
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    /**
     * Resolve the modal content according to the number of password reset options
     * configured in the server.
     */
    const resolveModalContent = () => {
        if (isResetPassword && governanceConnectorProperties?.length > 1) {
            return (
                <>
                    <Grid.Row>
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                            <Field
                                data-testid="user-mgt-add-user-form-passwordOption-radio-button"
                                type="radio"
                                label={ t("user:forms.addUserForm.buttons." +
                                    "radioButton.label") }
                                name="passwordOption"
                                default="setPassword"
                                listen={ (values: Map<string, FormValue>) => {
                                    setPasswordResetOption(values.get("passwordOption").toString());
                                } }
                                children={ passwordResetOptions }
                                value={ "setPassword" }
                                tabIndex={ 4 }
                                maxWidth={ 60 }
                                width={ 60 }
                            />
                        </Grid.Column>
                    </Grid.Row>
                    { handlePasswordResetOptionChange() }
                    <Grid.Row>
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                            <Message
                                type="warning"
                                content={ t("user:modals.changePasswordModal.message") }
                            />
                        </Grid.Column>
                    </Grid.Row>
                </>
            );
        } else {
            return (
                <>
                    { passwordFormFields() }
                    <Grid.Row>
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                            <Message
                                type="warning"
                                content={ isResetPassword
                                    ? t("user:modals.changePasswordModal.message")
                                    : t("user:modals.setPasswordModal.message") }
                            />
                        </Grid.Column>
                    </Grid.Row>
                </>
            );
        }
    };

    return (
        <Modal
            data-testid={ testId }
            open={ openChangePasswordModal }
            size="tiny"
        >
            <Modal.Header>
                { isResetPassword
                    ? t("user:modals.changePasswordModal.header")
                    : t("user:modals.setPasswordModal.header") }
            </Modal.Header>
            <Modal.Content>
                <Forms
                    data-testid={ `${ testId }-form` }
                    onSubmit={ (values: Map<string, FormValue>) => {
                        if (passwordResetOption === "setPassword") {
                            handleChangeUserPassword(values);
                        } else {
                            handleForcePasswordReset();
                        }
                    } }
                    submitState={ triggerSubmit }
                >
                    <Grid>
                        { resolveModalContent() }
                    </Grid>
                </Forms>
            </Modal.Content>
            <Modal.Actions>
                <Grid>
                    <Grid.Row column={ 1 }>
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 16 }>
                            <PrimaryButton
                                data-testid={ `${ testId }-save-button` }
                                floated="right"
                                loading={ isSubmitting }
                                disabled={ isSubmitting }
                                onClick={ () => setTriggerSubmit() }
                            >
                                { isResetPassword
                                    ? t("user:modals.changePasswordModal.button")
                                    : t("user:modals.setPasswordModal.button") }
                            </PrimaryButton>
                            <LinkButton
                                data-testid={ `${ testId }-cancel-button` }
                                floated="left"
                                onClick={ () => {
                                    handleCloseChangePasswordModal();
                                    handleModalClose();
                                } }
                            >
                                { t("common:cancel") }
                            </LinkButton>
                        </Grid.Column>
                    </Grid.Row>
                </Grid>
            </Modal.Actions>
        </Modal>
    );
};

/**
 * Change password component default props.
 */
ChangePasswordComponent.defaultProps = {
    "data-testid": "user-mgt-change-password"
};
