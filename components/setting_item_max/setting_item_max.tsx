// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import SaveButton from 'components/save_button';
import Constants from 'utils/constants';
import {isKeyPressed} from 'utils/utils.jsx';

interface Props {

    /**
     * Array of inputs selection
     */
    inputs?: Array<JSX.Element>;

    /**
     * Styles for main component
     */
    containerStyle: string;

    /**
     * Client error
     */
    clientError: string | Error | null;

    /**
     * Server error
     */
    serverError: string|null;

    /**
     * Settings extra information
     */
    extraInfo?: JSX.Element;

    /**
     * Info position
     */
    infoPosition: string;

    /**
     * Settings or tab section
     */
    section: string;

    /**
     * Function to update section
     */
    updateSection: (section: string) => void;

    /**
     * setting to submit
     */
    setting: string;

    /**
     * Function to submit setting
     */
    submit?: (value?: string) => void;

    /**
     * Disable submit by enter key
     */
    disableEnterSubmit: boolean;

    /**
     * Extra information on submit
     */
    submitExtra?: JSX.Element;

    /**
     * Indicates whether setting is on saving
     */
    saving: boolean;

    /**
     * Settings title
     */
    title?: string|JSX.Element;

    /**
     * Settings width
     */
    width: string;

    /**
     * Text of cancel button
     */
    cancelButtonText?: JSX.Element;

    /**
     * Avoid submitting when using SHIFT + ENTER
     */
    shiftEnter: boolean;

    /**
     * Text of save button
     */
    saveButtonText: string;
}

export default class SettingItemMax extends React.PureComponent<Props> {
    static defaultProps = {
        saveButtonText: '',
        disableEnterSubmit: false,
        setting: '',
        width: '',
        shiftEnter: false,
        infoPosition: 'bottom',
        saving: false,
        section: '',
        containerStyle: '',
    };

    public settingList = React.createRef<HTMLDivElement>();

    componentDidMount() {
        if (this.settingList.current) {
            const focusableElements = this.settingList.current.querySelectorAll('.btn:not(.save-button):not(.btn-cancel), input.form-control, select, textarea, [tabindex]:not([tabindex="-1"])') as NodeListOf<HTMLElement>;
            if (focusableElements.length > 0) {
                focusableElements[0].focus();
            } else {
                this.settingList.current.focus();
            }
        }

        document.addEventListener('keydown', this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown);
    }

    onKeyDown = (e: KeyboardEvent) => {
        if (this.props.shiftEnter && e.keyCode === Constants.KeyCodes.ENTER[1] && e.shiftKey) {
            return;
        }
        const element = e.target as HTMLElement;
        if (this.props.disableEnterSubmit !== true && isKeyPressed(e, Constants.KeyCodes.ENTER) && this.props.submit && element && element.tagName !== 'SELECT' && element.parentElement && element.parentElement.className !== 'react-select__input' && !element.classList.contains('btn-cancel') && this.settingList.current && this.settingList.current.contains(element)) {
            this.handleSubmit();
        }
    }

    handleSubmit = () => {
        if (this.props.submit) {
            if (this.props.setting) {
                this.props.submit(this.props.setting);
            } else {
                this.props.submit();
            }
        }
    }

    handleMouseSubmit = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        e.preventDefault();
        this.handleSubmit();
    }

    handleUpdateSection = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        this.props.updateSection(this.props.section);
        e.preventDefault();
    }

    render() {
        let clientError = null;
        if (this.props.clientError) {
            clientError = (
                <div className='form-group'>
                    <label
                        id='clientError'
                        className='col-sm-12 has-error'
                    >
                        {this.props.clientError}
                    </label>
                </div>
            );
        }

        let serverError = null;
        if (this.props.serverError) {
            serverError = (
                <div className='form-group'>
                    <label
                        id='serverError'
                        className='col-sm-12 has-error'
                    >
                        {this.props.serverError}
                    </label>
                </div>
            );
        }

        let extraInfo = null;
        let hintClass = 'setting-list__hint';
        if (this.props.infoPosition === 'top') {
            hintClass = 'pb-3';
        }

        if (this.props.extraInfo) {
            extraInfo = (
                <div
                    id='extraInfo'
                    className={hintClass}
                >
                    {this.props.extraInfo}
                </div>
            );
        }

        let submit = null;
        if (this.props.submit) {
            submit = (
                <SaveButton
                    defaultMessage={this.props.saveButtonText}
                    saving={this.props.saving}
                    disabled={this.props.saving}
                    onClick={this.handleMouseSubmit}
                />
            );
        }

        const inputs = this.props.inputs;
        let widthClass;
        if (this.props.width === 'full') {
            widthClass = 'col-sm-12';
        } else if (this.props.width === 'medium') {
            widthClass = 'col-sm-10 col-sm-offset-2';
        } else {
            widthClass = 'col-sm-9 col-sm-offset-3';
        }

        let title;
        if (this.props.title) {
            title = (
                <h4
                    id='settingTitle'
                    className='col-sm-12 section-title'
                >
                    {this.props.title}
                </h4>
            );
        }

        let listContent = (
            <div className='setting-list-item'>
                {inputs}
                {extraInfo}
            </div>
        );

        if (this.props.infoPosition === 'top') {
            listContent = (
                <div>
                    {extraInfo}
                    {inputs}
                </div>
            );
        }

        let cancelButtonText;
        if (this.props.cancelButtonText) {
            cancelButtonText = this.props.cancelButtonText;
        } else {
            cancelButtonText = (
                <FormattedMessage
                    id='setting_item_max.cancel'
                    defaultMessage='Cancel'
                />
            );
        }

        return (
            <section
                className={`section-max form-horizontal ${this.props.containerStyle}`}
            >
                {title}
                <div className={widthClass}>
                    <div
                        tabIndex={-1}
                        ref={this.settingList}
                        className='setting-list'
                    >
                        {listContent}
                        <div className='setting-list-item'>
                            <hr/>
                            {this.props.submitExtra}
                            {serverError}
                            {clientError}
                            {submit}
                            <button
                                id={'cancelSetting'}
                                className='btn btn-sm btn-cancel cursor--pointer style--none'
                                onClick={this.handleUpdateSection}
                            >
                                {cancelButtonText}
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        );
    }
}
